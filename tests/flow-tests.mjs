/**
 * Automated flow tests for My Fit Mini.
 * Run: node tests/flow-tests.mjs
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const { readFileSync, existsSync } = fs;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const sharedStorage = new Map();
const sharedImageMemory = {};

function createStorage() {
  return {
    getItem(key) {
      return sharedStorage.has(key) ? sharedStorage.get(key) : null;
    },
    setItem(key, value) {
      sharedStorage.set(key, String(value));
    },
    removeItem(key) {
      sharedStorage.delete(key);
    },
    clear() {
      sharedStorage.clear();
    },
    get length() {
      return sharedStorage.size;
    },
    key(index) {
      return Array.from(sharedStorage.keys())[index] || null;
    }
  };
}

function loadApp() {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (err) => errors.push(String(err)));
  virtualConsole.on('error', (err) => errors.push(String(err)));
  globalThis.__MYFIT_SHARED_IMAGES__ = sharedImageMemory;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    resources: 'usable',
    virtualConsole
  });
  const { window } = dom;
  window.__MYFIT_SHARED_IMAGES__ = sharedImageMemory;
  Object.defineProperty(window, 'localStorage', { value: createStorage() });
  window.URL.createObjectURL = (blob) => 'blob:mock-' + (blob && blob.size);
  window.URL.revokeObjectURL = () => {};
  const doc = window.document;
  doc.body.innerHTML = readFileSync(join(root, 'index.html'), 'utf8')
    .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1]
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  window.eval(readFileSync(join(root, 'data.js'), 'utf8'));
  window.eval(readFileSync(join(root, 'images.js'), 'utf8'));
  window.eval(readFileSync(join(root, 'app.js'), 'utf8'));
  return { window, dom, errors };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resetStorage() {
  sharedStorage.clear();
  Object.keys(sharedImageMemory).forEach((key) => delete sharedImageMemory[key]);
}

function makeMiniWorkout() {
  return {
    id: 'test',
    title: 'Test Workout',
    exercises: [
      {
        id: 'test-ex-1',
        name: 'Exercise One',
        image: '',
        imageId: '',
        instructions: 'Do one',
        notes: 'Note one',
        sets: 3,
        reps: 10,
        resistance: 5,
        resistanceType: 'kg'
      },
      {
        id: 'test-ex-2',
        name: 'Exercise Two',
        image: '',
        imageId: '',
        instructions: 'Do two',
        notes: '',
        sets: 2,
        reps: 12,
        resistance: 0,
        resistanceType: 'bodyweight'
      }
    ]
  };
}

function installMiniWorkout(window) {
  const D = window.MyFitData;
  window.MyFitApp.setActiveSession(null);
  const workouts = window.MyFitApp.getWorkouts();
  workouts.test = makeMiniWorkout();
  D.saveWorkouts(workouts);
  window.MyFitApp.selectWorkout('test');
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const results = [];
  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, err) => results.push({ name, ok: false, err: String(err) });

  // Keep original 7 core tests
  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const app = window.MyFitApp;
    app.startWorkout(0);
    app.completeSet();
    let session = app.getActiveSession();
    assert(session.phase === 'rest-set', 'set rest after set 1');
    assert(session.restRemaining >= 59 && session.restRemaining <= 60, 'set rest is 60s');
    app.finishRestAdvance();
    app.completeSet();
    app.finishRestAdvance();
    app.completeSet();
    session = app.getActiveSession();
    assert(session.phase === 'rest-exercise', 'exercise rest after finishing 3/3 sets');
    assert(session.restRemaining >= 89 && session.restRemaining <= 90, 'exercise rest is 90s');
    pass('TEST 1: 3/3 sets -> 60s set rest, 90s exercise rest');
  } catch (err) {
    fail('TEST 1', err);
  }

  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const app = window.MyFitApp;
    app.startWorkout(0);
    app.completeSet();
    app.finishRestAdvance();
    app.completeSet();
    app.completeExercise(true);
    const session = app.getActiveSession();
    assert(session.phase === 'rest-exercise', 'goes to exercise rest');
    assert(session.restRemaining >= 89 && session.restRemaining <= 90, 'exercise rest is 90s');
    assert(session.exercises[0].actualSetsCompleted === 2, 'stores actual sets completed');
    pass('TEST 2: 2/3 sets + complete exercise -> 90s exercise rest only');
  } catch (err) {
    fail('TEST 2', err);
  }

  try {
    const first = loadApp();
    resetStorage();
    installMiniWorkout(first.window);
    const workouts = first.window.MyFitApp.getWorkouts();
    workouts.test.exercises[0].name = 'Edited Exercise';
    workouts.test.exercises[0].sets = 4;
    workouts.test.exercises[0].instructions = 'A'.repeat(5000);
    first.window.MyFitData.saveWorkouts(workouts);
    first.dom.window.close();
    const reloaded = loadApp();
    const saved = reloaded.window.MyFitData.loadWorkouts();
    assert(saved.test.exercises[0].name === 'Edited Exercise', 'name persisted');
    assert(saved.test.exercises[0].sets === 4, 'sets persisted');
    assert(saved.test.exercises[0].instructions.length === 5000, 'long instructions persisted');
    pass('TEST 3: edit exercise persists after reload');
    reloaded.dom.window.close();
  } catch (err) {
    fail('TEST 3', err);
  }

  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const D = window.MyFitData;
    const app = window.MyFitApp;
    app.startWorkout(0);
    const oldSnapshotName = app.getActiveSession().exercises[0].snapshot.name;
    app.finishWorkout();
    const workouts = app.getWorkouts();
    workouts.test.exercises[0] = {
      id: 'test-ex-new',
      name: 'Brand New Exercise',
      image: '',
      imageId: '',
      instructions: 'New',
      notes: '',
      sets: 3,
      reps: 8,
      resistance: 2,
      resistanceType: 'kg'
    };
    D.saveWorkouts(workouts);
    const history = D.loadHistory();
    assert(history[0].exercises[0].snapshot.name === oldSnapshotName, 'history keeps old snapshot');
    assert(oldSnapshotName === 'Exercise One', 'snapshot came from test workout');
    assert(app.getWorkouts().test.exercises[0].name === 'Brand New Exercise', 'current workout updated');
    pass('TEST 4: replace exercise keeps history snapshot');
  } catch (err) {
    fail('TEST 4', err);
  }

  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const app = window.MyFitApp;
    const D = window.MyFitData;
    app.startWorkout(0);
    const session = app.getActiveSession();
    session.startTime = new Date(Date.now() - 120000).toISOString();
    app.setActiveSession(session);
    app.completeExercise(true);
    app.finishRestAdvance();
    app.completeExercise(true);
    const history = D.loadHistory();
    assert(history[0].actualDuration >= 100, 'actual duration saved');
    assert(history[0].startTime, 'start time saved');
    assert(history[0].endTime, 'end time saved');
    pass('TEST 5: actual duration saved');
  } catch (err) {
    fail('TEST 5', err);
  }

  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const D = window.MyFitData;
    const workout = D.loadWorkouts().test;
    const estimatedBefore = D.estimateWorkoutSeconds(workout);
    const app = window.MyFitApp;
    app.startWorkout(0);
    const session = app.getActiveSession();
    session.startTime = new Date(Date.now() - 600000).toISOString();
    app.setActiveSession(session);
    app.finishWorkout();
    const history = D.loadHistory();
    assert(history[0].estimatedDuration === estimatedBefore, 'estimated duration unchanged');
    assert(history[0].actualDuration > history[0].estimatedDuration, 'actual can differ');
    pass('TEST 6: estimated duration independent from actual');
  } catch (err) {
    fail('TEST 6', err);
  }

  try {
    const first = loadApp();
    resetStorage();
    installMiniWorkout(first.window);
    first.window.MyFitApp.startWorkout(0);
    first.window.MyFitApp.completeSet();
    const saved = first.window.MyFitData.loadActiveSession();
    assert(saved && saved.phase === 'rest-set', 'active session saved mid rest');
    first.dom.window.close();
    const second = loadApp();
    const resumed = second.window.MyFitData.loadActiveSession();
    assert(resumed && resumed.phase === 'rest-set', 'session restored after reload');
    second.window.MyFitApp.continueWorkout();
    assert(second.window.MyFitApp.getActiveSession().phase === 'rest-set', 'resume continues rest');
    pass('TEST 7: reload mid-workout resumes');
    second.dom.window.close();
  } catch (err) {
    fail('TEST 7', err);
  }

  // NEW: replace persists after reload
  try {
    const first = loadApp();
    resetStorage();
    installMiniWorkout(first.window);
    const workouts = first.window.MyFitApp.getWorkouts();
    workouts.test.exercises[0] = {
      id: 'replaced-1',
      name: 'Replaced Persist',
      image: '',
      imageId: '',
      instructions: 'New guide',
      notes: 'New note',
      sets: 5,
      reps: 7,
      resistance: 12,
      resistanceType: 'kg'
    };
    first.window.MyFitData.saveWorkouts(workouts);
    first.dom.window.close();
    const second = loadApp();
    const saved = second.window.MyFitData.loadWorkouts().test.exercises[0];
    assert(saved.name === 'Replaced Persist', 'replace name persisted');
    assert(saved.sets === 5 && saved.reps === 7, 'replace sets/reps persisted');
    pass('TEST 8: replace exercise persists after reload');
    second.dom.window.close();
  } catch (err) {
    fail('TEST 8', err);
  }

  // NEW: upload image -> reload -> image remains
  try {
    const first = loadApp();
    resetStorage();
    installMiniWorkout(first.window);
    const Img = first.window.MyFitImages;
    const D = first.window.MyFitData;
    const blob = new first.window.Blob(['fake-image-bytes'], { type: 'image/png' });
    const imageId = await Img.putImage(blob);
    const workouts = first.window.MyFitApp.getWorkouts();
    workouts.test.exercises[0].imageId = imageId;
    workouts.test.exercises[0].image = '';
    D.saveWorkouts(workouts);
    first.dom.window.close();
    const second = loadApp();
    const saved = second.window.MyFitData.loadWorkouts().test.exercises[0];
    assert(saved.imageId === imageId, 'imageId persisted in exercise metadata');
    const restored = await second.window.MyFitImages.getImage(imageId);
    assert(!!restored, 'image blob restored from store');
    pass('TEST 9: upload image persists after reload');
    second.dom.window.close();
  } catch (err) {
    fail('TEST 9', err);
  }

  // NEW: replace exercise -> history old image/name unchanged
  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const D = window.MyFitData;
    const Img = window.MyFitImages;
    const app = window.MyFitApp;
    const blob = new window.Blob(['history-image'], { type: 'image/png' });
    const oldImageId = await Img.putImage(blob);
    const workouts = app.getWorkouts();
    workouts.test.exercises[0].name = 'Original With Image';
    workouts.test.exercises[0].imageId = oldImageId;
    D.saveWorkouts(workouts);
    app.selectWorkout('test');
    app.startWorkout(0);
    const snapName = app.getActiveSession().exercises[0].snapshot.name;
    const snapImageId = app.getActiveSession().exercises[0].snapshot.imageId;
    assert(snapName === 'Original With Image', 'session snapshot uses current exercise name');
    assert(snapImageId === oldImageId, 'session snapshot keeps imageId');
    app.finishWorkout();
    const after = app.getWorkouts();
    after.test.exercises[0] = {
      id: 'brand-new',
      name: 'Totally New',
      image: '',
      imageId: '',
      instructions: 'x',
      notes: '',
      sets: 1,
      reps: 1,
      resistance: 0,
      resistanceType: 'bodyweight'
    };
    D.saveWorkouts(after);
    const history = D.loadHistory();
    assert(history[0].exercises[0].snapshot.name === snapName, 'history name unchanged');
    assert(history[0].exercises[0].snapshot.imageId === snapImageId, 'history imageId unchanged');
    const histBlob = await Img.getImage(snapImageId);
    assert(!!histBlob, 'history image still resolvable');
    pass('TEST 10: replace exercise does not change history image/name');
  } catch (err) {
    fail('TEST 10', err);
  }

  // NEW: finish workout -> history UI appears and detail opens
  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const app = window.MyFitApp;
    app.startWorkout(0);
    app.completeExercise(true);
    app.finishRestAdvance();
    app.completeExercise(true);
    const history = window.MyFitData.loadHistory();
    assert(history.length === 1, 'history has one entry');
    app.renderHistory();
    const cards = window.document.querySelectorAll('#history-list .history-card');
    assert(cards.length === 1, 'history card rendered');
    assert(cards[0].textContent.includes('Test Workout'), 'history shows workout name');
    assert(cards[0].textContent.includes('Thời gian dự kiến'), 'history shows estimated');
    assert(cards[0].textContent.includes('Thời gian thực tế'), 'history shows actual');
    assert(cards[0].textContent.includes('Set dự kiến'), 'history shows planned sets');
    assert(cards[0].textContent.includes('Set thực tế'), 'history shows actual sets');
    app.openHistoryDetail(0);
    const detail = window.document.getElementById('history-detail-overlay');
    assert(detail.style.display === 'flex', 'history detail overlay opens');
    const content = window.document.getElementById('history-detail-content').textContent;
    assert(content.includes('Exercise One'), 'detail shows exercise name');
    assert(content.includes('Actual sets'), 'detail shows actual sets');
    pass('TEST 11: completed workout appears in history UI with detail');
  } catch (err) {
    fail('TEST 11', err);
  }

  // NEW: History UI is present on Home even when empty
  try {
    const { window } = loadApp();
    resetStorage();
    const section = window.document.getElementById('history-section');
    const list = window.document.getElementById('history-list');
    const jump = window.document.getElementById('jump-history-btn');
    assert(!!section, 'history-section exists in DOM');
    assert(!!list, 'history-list exists in DOM');
    assert(!!jump, 'jump-history button exists');
    assert(section.textContent.includes('Lịch sử tập'), 'section title visible');
    window.MyFitApp.renderHistory();
    assert(list.textContent.includes('Chưa có lịch sử') || list.textContent.includes('Hoàn thành'), 'empty state rendered');
    pass('TEST 13: History UI visible on Home when empty');
  } catch (err) {
    fail('TEST 13', err);
  }

  // NEW: edit after history does not mutate snapshot
  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const app = window.MyFitApp;
    const D = window.MyFitData;
    app.startWorkout(0);
    app.finishWorkout();
    const before = D.clone(D.loadHistory()[0]);
    const workouts = app.getWorkouts();
    workouts.test.exercises[0].name = 'Changed Later';
    workouts.test.exercises[0].sets = 9;
    workouts.test.exercises[0].reps = 99;
    workouts.test.exercises[0].resistance = 99;
    D.saveWorkouts(workouts);
    const after = D.loadHistory()[0];
    assert(after.exercises[0].snapshot.name === before.exercises[0].snapshot.name, 'edit does not change history name');
    assert(after.exercises[0].snapshot.sets === before.exercises[0].snapshot.sets, 'edit does not change history sets');
    assert(after.exercises[0].snapshot.reps === before.exercises[0].snapshot.reps, 'edit does not change history reps');
    assert(after.exercises[0].snapshot.resistance === before.exercises[0].snapshot.resistance, 'edit does not change history resistance');
    pass('TEST 14: edit exercise after history keeps snapshot immutable');
  } catch (err) {
    fail('TEST 14', err);
  }

  // NEW: reload keeps history
  try {
    const first = loadApp();
    resetStorage();
    installMiniWorkout(first.window);
    first.window.MyFitApp.startWorkout(0);
    first.window.MyFitApp.finishWorkout();
    assert(first.window.MyFitData.loadHistory().length === 1, 'history saved');
    first.dom.window.close();
    const second = loadApp();
    const history = second.window.MyFitData.loadHistory();
    assert(history.length === 1, 'history remains after reload');
    second.window.MyFitApp.renderHistory();
    assert(second.window.document.querySelectorAll('#history-list .history-card').length === 1, 'history card rendered after reload');
    pass('TEST 15: reload app keeps History UI data');
    second.dom.window.close();
  } catch (err) {
    fail('TEST 15', err);
  }

  // NEW: Glutes A order is Leg Curl then Bulgarian
  try {
    const { window } = loadApp();
    resetStorage();
    const fresh = loadApp();
    const exercises = fresh.window.MyFitData.loadWorkouts().a.exercises;
    assert(/leg\s*curl/i.test(exercises[0].name), 'Bai 1 is Leg Curl');
    assert(exercises[1].name === 'Bulgarian Split Squat', 'Bai 2 is Bulgarian Split Squat');
    assert(!/romanian/i.test(exercises[0].name), 'Bai 1 is not RDL');
    assert(exercises[0].sets === 3, 'Leg Curl has 3 sets');
    assert(exercises[0].repsRange === '15–20' || exercises[0].reps >= 15, 'Leg Curl reps 15-20');
    assert(String(exercises[0].image).indexOf('exercises/seated-leg-curl') >= 0 || String(exercises[0].image).indexOf('leg-curl') >= 0, 'Leg Curl has illustration image');
    assert(exercises[0].notes.indexOf('đùi sau') >= 0, 'Leg Curl notes mention hamstrings');
    // migrate from old BSS-first storage
    const D = fresh.window.MyFitData;
    const old = D.clone(D.DEFAULT_WORKOUTS);
    // simulate pre-migration by forcing BSS first without leg curl
    old.a.exercises = old.a.exercises.filter((ex) => !/leg\s*curl/i.test(ex.name));
    if (old.a.exercises[0].name !== 'Bulgarian Split Squat') {
      old.a.exercises.unshift({
        id: 'a-bulgarian-split-squat',
        name: 'Bulgarian Split Squat',
        image: '',
        imageId: '',
        instructions: 'x',
        notes: '',
        sets: 3,
        reps: 10,
        resistance: 5,
        resistanceType: 'kg'
      });
    }
    D.saveWorkouts(old);
    fresh.dom.window.close();
    const migrated = loadApp();
    const after = migrated.window.MyFitData.loadWorkouts().a.exercises;
    assert(/leg\s*curl/i.test(after[0].name), 'migration inserts Leg Curl first');
    assert(after[1].name === 'Bulgarian Split Squat', 'migration keeps Bulgarian second');
    pass('TEST 17: Glutes A order Leg Curl then Bulgarian + migration');
    migrated.dom.window.close();
  } catch (err) {
    fail('TEST 17', err);
  }

  // NEW: Glutes A has no Romanian Deadlift; Sumo is #3
  try {
    resetStorage();
    const { window } = loadApp();
    const exercises = window.MyFitData.loadWorkouts().a.exercises;
    assert(exercises.every((ex) => !/romanian\s*deadlift/i.test(ex.name)), 'no Romanian Deadlift in Glutes A');
    assert(exercises[0] && /leg\s*curl/i.test(exercises[0].name), '1 is Leg Curl');
    assert(exercises[1] && exercises[1].name === 'Bulgarian Split Squat', '2 is Bulgarian');
    assert(exercises[2] && exercises[2].name === 'Sumo Squat', '3 is Sumo Squat');
    assert(exercises[3] && /Cable Kickback/i.test(exercises[3].name), '4 is Cable Kickback');
    // migration removes RDL from stored workouts without duplicating Sumo
    const D = window.MyFitData;
    const withRdl = D.clone(D.loadWorkouts());
    withRdl.a.exercises = [
      withRdl.a.exercises[0],
      withRdl.a.exercises[1],
      {
        id: 'a-romanian-deadlift',
        name: 'Romanian Deadlift',
        image: '',
        imageId: '',
        instructions: 'old rdl',
        notes: '',
        sets: 3,
        reps: 11,
        resistance: 5,
        resistanceType: 'kg'
      },
      ...withRdl.a.exercises.slice(2)
    ];
    const sumoBefore = withRdl.a.exercises.find((ex) => ex.name === 'Sumo Squat');
    D.saveWorkouts(withRdl);
    window.close?.();
    const again = loadApp();
    const after = again.window.MyFitData.loadWorkouts().a.exercises;
    assert(after.every((ex) => !/romanian\s*deadlift/i.test(ex.name)), 'migration removes RDL');
    assert(after[2].name === 'Sumo Squat', 'after migration Sumo is still #3');
    assert(after.filter((ex) => ex.name === 'Sumo Squat').length === 1, 'no duplicate Sumo');
    assert(after[2].sets === sumoBefore.sets && after[2].reps === sumoBefore.reps, 'Sumo data preserved');
    pass('TEST 19: Glutes A removes Romanian Deadlift; Sumo is #3');
    again.dom.window.close();
  } catch (err) {
    fail('TEST 19', err);
  }

  // NEW: Welcome screen present and buttons route correctly
  try {
    const { window } = loadApp();
    resetStorage();
    const app = window.MyFitApp;
    const welcome = window.document.getElementById('welcome-screen');
    const home = window.document.getElementById('app-home');
    const library = window.document.getElementById('library-screen');
    assert(!!welcome, 'welcome-screen exists');
    assert(!!home, 'app-home exists');
    assert(!!library, 'library-screen exists');
    assert(!welcome.hidden, 'welcome visible on open');
    assert(home.hidden, 'home hidden on open');
    assert(window.document.getElementById('welcome-start-btn'), 'start button');
    assert(window.document.getElementById('welcome-schedule-btn'), 'schedule button');
    assert(window.document.getElementById('welcome-library-btn'), 'library button');
    assert(window.MyFitData.WELCOME_BACKGROUND_IMAGE.indexOf('welcome-background') >= 0, 'background constant');
    assert(window.MyFitData.REST_SET_SECONDS === 60, 'set rest still 60');
    assert(window.MyFitData.REST_EXERCISE_SECONDS === 90, 'exercise rest still 90');
    app.welcomeOpenSchedule();
    assert(welcome.hidden, 'welcome hidden after schedule');
    assert(!home.hidden, 'home shown after schedule');
    app.showWelcome();
    app.welcomeOpenLibrary();
    assert(!library.hidden, 'library shown');
    assert(home.hidden, 'home hidden in library');
    pass('TEST 18: Welcome screen + navigation + timer constants unchanged');
  } catch (err) {
    fail('TEST 18', err);
  }

  // NEW: version meta and history section in HTML source
  try {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert(html.includes('myfit-version" content="13"'), 'version meta is 13');
    assert(html.includes('id="welcome-screen"'), 'welcome-screen in HTML');
    assert(html.includes('id="history-section"'), 'history-section in HTML');
    assert(html.includes('Lịch sử tập'), 'Lịch sử tập label in HTML');
    assert(html.includes('jump-history-btn'), 'jump history button in HTML');
    assert(html.includes('myfit-ui-version'), 'safe cache refresh gate present');
    assert(html.includes('assets/logo-header.png'), 'app logo in HTML');
    assert(html.includes('apple-touch-icon.png'), 'apple-touch-icon uses logo mau 6');
    assert(html.includes('Bắt đầu ngay'), 'welcome primary CTA');
    assert(html.includes('Tập theo lịch'), 'welcome schedule CTA');
    assert(html.includes('Tập theo bài'), 'welcome library CTA');
    const sw = readFileSync(join(root, 'sw.js'), 'utf8');
    assert(sw.includes('my-fit-mini-v13'), 'service worker cache v9');
    pass('TEST 16: HTML/SW ship welcome + History UI + cache v13 + workout management');
  } catch (err) {
    fail('TEST 16', err);
  }

  // NEW: edit form fields exist and textareas have no maxlength
  try {
    const { window } = loadApp();
    const edit = window.document.getElementById('edit-form');
    const replace = window.document.getElementById('replace-form');
    ['name', 'instructions', 'notes', 'image', 'sets', 'reps', 'resistance', 'resistanceType', 'imageFile'].forEach((field) => {
      assert(!!edit.elements[field], 'edit has ' + field);
      assert(!!replace.elements[field], 'replace has ' + field);
    });
    assert(edit.elements.instructions.getAttribute('maxlength') == null, 'edit instructions unlimited');
    assert(edit.elements.notes.getAttribute('maxlength') == null, 'edit notes unlimited');
    assert(edit.elements.instructions.tagName === 'TEXTAREA', 'instructions is textarea');
    assert(edit.elements.notes.tagName === 'TEXTAREA', 'notes is textarea');
    pass('TEST 12: edit/replace forms include all fields + unlimited textareas');
  } catch (err) {
    fail('TEST 12', err);
  }

  // NEW: every default exercise has a stable repo asset image (cross-device)
  try {
    resetStorage();
    const { window, dom } = loadApp();
    const D = window.MyFitData;
    const Img = window.MyFitImages;
    const workouts = D.loadWorkouts();
    let total = 0;
    const missing = [];
    for (const workoutId of Object.keys(workouts)) {
      for (const exercise of workouts[workoutId].exercises) {
        total += 1;
        assert(D.isStableAssetPath(exercise.image), exercise.name + ' uses stable asset path');
        assert(exercise.image.indexOf('assets/exercises/') === 0, exercise.name + ' under assets/exercises');
        const filePath = join(root, exercise.image);
        assert(existsSync(filePath), exercise.name + ' file exists: ' + exercise.image);
        const resolved = await Img.resolveImageSrc(exercise);
        assert(
          resolved === exercise.image || String(resolved).indexOf('assets/exercises/') >= 0,
          exercise.name + ' resolves to asset, not blob/id'
        );
        // imageId-only stored row still resolves via catalog
        const idOnly = { id: exercise.id, name: exercise.name, image: '', imageId: 'img-missing-on-other-device' };
        const viaCatalog = await Img.resolveImageSrc(idOnly);
        assert(
          viaCatalog === exercise.image || String(viaCatalog).indexOf(exercise.image) >= 0 || String(viaCatalog).indexOf('assets/exercises/') >= 0,
          exercise.name + ' catalog fallback works without IndexedDB'
        );      }
    }
    assert(total === 15, 'checked all 15 default exercises, got ' + total);
    assert(Object.keys(D.EXERCISE_IMAGE_ASSETS).length >= 15, 'catalog has at least 15 entries');
    // SW precaches exercise assets
    const sw = readFileSync(join(root, 'sw.js'), 'utf8');
    assert((sw.match(/assets\/exercises\//g) || []).length >= 15, 'SW caches exercise images');
    pass('TEST 20: all exercises use repo assets (no device-only image deps)');
    dom.window.close();
  } catch (err) {
    fail('TEST 20', err);
  }

  // NEW: workout management features (order, set logs, library, supplemental)
  try {
    resetStorage();
    const first = loadApp();
    const D = first.window.MyFitData;
    const app = first.window.MyFitApp;
    assert(!!first.window.document.getElementById('home-back-btn'), 'home back button exists');
    assert(D.REST_SET_SECONDS === 60 && D.REST_EXERCISE_SECONDS === 90, 'timer constants unchanged');

    // CASE-like: reorder day order without changing default workout until save
    const beforeIds = D.loadWorkouts().a.exercises.map((e) => e.id);
    app.moveDisplayedExercise(0, 1);
    const dayOrder = D.getDayOrder('a');
    assert(Array.isArray(dayOrder) && dayOrder[0] === beforeIds[1], 'day order moved first exercise down');
    assert(D.loadWorkouts().a.exercises[0].id === beforeIds[0], 'default workout order unchanged until save');
    app.saveDisplayedOrderAsDefault();
    assert(D.loadWorkouts().a.exercises[0].id === beforeIds[1], 'saved default order');

    // per-set resistance in session/history
    resetStorage();
    const second = loadApp();
    const D2 = second.window.MyFitData;
    const app2 = second.window.MyFitApp;
    app2.setActiveSession(null);
    const workout = D2.loadWorkouts().a;
    let session = D2.createWorkoutSession(workout);
    session.exercises[0].snapshot.sets = 3;
    session.exercises[0].setLogs = D2.createSetLogs(session.exercises[0].snapshot);
    session.exercises[0].setLogs[0].resistance = 10;
    session.exercises[0].setLogs[1].resistance = 12;
    session.exercises[0].setLogs[2].resistance = 12;
    session.exercises[0].setLogs.forEach((l) => { l.completed = true; });
    session.exercises[0].actualSetsCompleted = 3;
    session.exercises[0].completionStatus = 'completed';
    session.exercises[0].snapshot.resistance = 10; // default stays 10
    // add supplemental
    const lib = D2.loadLibrary();
    assert(lib.exercises.length >= 5, 'library seeded');
    const kick = lib.exercises.find((e) => /cable kickback/i.test(e.name));
    session.exercises.push(D2.createSessionExercise(kick, 'supplemental'));
    session.exercises[session.exercises.length - 1].actualSetsCompleted = 2;
    session.exercises[session.exercises.length - 1].setLogs[0].resistance = 8;
    session.exercises[session.exercises.length - 1].setLogs[0].completed = true;
    session.exercises[session.exercises.length - 1].setLogs[1].resistance = 8;
    session.exercises[session.exercises.length - 1].setLogs[1].completed = true;
    session.exercises[session.exercises.length - 1].completionStatus = 'completed';
    session.endTime = new Date().toISOString();
    const entry = D2.finalizeHistoryEntry(session);
    assert(entry.exercises[0].snapshot.resistance === 10, 'exercise default resistance preserved');
    assert(entry.exercises[0].setLogs[0].resistance === 10, 'set1 logged 10');
    assert(entry.exercises[0].setLogs[1].resistance === 12, 'set2 logged 12');
    assert(entry.exercises[0].setLogs[2].resistance === 12, 'set3 logged 12');
    const supp = entry.exercises.filter((e) => e.role === 'supplemental');
    assert(supp.length === 1, 'one supplemental in history entry');
    assert(entry.exercises.length === workout.exercises.length + 1, 'same history entry contains scheduled + supplemental');

    // library solo session kind
    const solo = D2.createWorkoutSession(
      { id: 'library', title: 'Tập theo bài · Face Pull', exercises: [lib.exercises.find((e) => /face pull/i.test(e.name))] },
      { sessionKind: 'library' }
    );
    assert(solo.sessionKind === 'library', 'library session kind');
    assert(solo.exercises.length === 1, 'solo library workout has one exercise');

    // HTML markers for new UI
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert(html.includes('home-back-btn'), 'back home button markup');
    assert(html.includes('add-exercise-form'), 'add exercise form markup');
    assert(html.includes('w-set-resistance'), 'per-set resistance input');
    assert(html.includes('library-add-btn'), 'library add button');

    pass('TEST 21: order + per-set logs + supplemental + library');
    first.dom.window.close();
    second.dom.window.close();
  } catch (err) {
    fail('TEST 21', err);
  }

  console.log('\nMy Fit Mini Test Results');
  console.log('========================');
  results.forEach((result) => {
    if (result.ok) console.log('PASS', result.name);
    else console.log('FAIL', result.name, '-', result.err);
  });
  const failed = results.filter((r) => !r.ok).length;
  console.log('\nTotal:', results.length, 'Passed:', results.length - failed, 'Failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

process.on('unhandledRejection', () => {});
run();
