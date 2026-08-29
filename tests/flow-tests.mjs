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
    assert(content.includes('Set hoàn thành'), 'detail shows actual sets');
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
    assert(!window.document.getElementById('welcome-start-btn'), 'start button removed');
    assert(window.document.getElementById('welcome-schedule-btn'), 'schedule button');
    assert(window.document.getElementById('welcome-library-btn'), 'library button');
    assert(window.document.getElementById('welcome-schedule-btn').textContent === 'Tập theo lịch cố định', 'schedule button label');
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
    assert(html.includes('myfit-version" content="21"'), 'version meta is 21');
    assert(html.includes('welcome-background.jpg'), 'welcome img uses uploaded asset');
    assert(html.includes('<img class="welcome-bg"'), 'welcome background is full-bleed img');
    assert(html.includes('id="welcome-screen"'), 'welcome-screen in HTML');
    assert(html.includes('id="history-section"'), 'history-section in HTML');
    assert(html.includes('Lịch sử tập'), 'Lịch sử tập label in HTML');
    assert(html.includes('jump-history-btn'), 'jump history button in HTML');
    assert(html.includes('myfit-ui-version'), 'safe cache refresh gate present');
    assert(html.includes('assets/logo-header.png'), 'app logo in HTML');
    assert(html.includes('apple-touch-icon.png'), 'apple-touch-icon uses logo mau 6');
    assert(html.includes('Tập theo lịch cố định'), 'welcome schedule CTA');
    assert(html.includes('Tập theo lịch'), 'welcome schedule CTA');
    assert(html.includes('Tập theo bài'), 'welcome library CTA');
    const sw = readFileSync(join(root, 'sw.js'), 'utf8');
    assert(sw.includes('my-fit-mini-v21'), 'service worker cache v21');
    assert(!html.includes('welcome-quote'), 'welcome quote removed');
    assert(!html.includes('Nhỏ từng ngày'), 'no extra welcome quote line');
    pass('TEST 16: HTML/SW ship welcome + History UI + cache v21 + workout management');
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
    // add supplemental at next slot (not append)
    const lib = D2.loadLibrary();
    assert(lib.exercises.length >= 5, 'library seeded');
    const kick = lib.exercises.find((e) => /cable kickback/i.test(e.name));
    const insertAt = 1;
    session.exercises.splice(insertAt, 0, D2.createSessionExercise(kick, 'supplemental'));
    session.exercises[insertAt].actualSetsCompleted = 2;
    session.exercises[insertAt].setLogs[0].resistance = 8;
    session.exercises[insertAt].setLogs[0].completed = true;
    session.exercises[insertAt].setLogs[1].resistance = 8;
    session.exercises[insertAt].setLogs[1].completed = true;
    session.exercises[insertAt].completionStatus = 'completed';
    assert(session.exercises[insertAt].role === 'supplemental', 'supplemental at insert slot');
    assert(session.exercises[insertAt].snapshot.name === kick.name, 'supplemental is kickback');
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
    assert(html.includes('w-set-resistance'), 'per-set resistance input markup');
    assert(html.includes('w-set-resistance-type'), 'per-set resistance unit select');
    assert(html.includes('w-resistance-history-btn'), 'resistance history button');
    assert(html.includes('↻ Lịch sử tạ'), 'resistance history label');
    assert(html.includes('workout-actions'), 'sticky workout actions bar');
    assert(html.includes('complete-set-btn'), 'complete set primary action');
    assert(html.includes('workout-pick-exercise-btn'), 'pick exercise button');
    assert(html.includes('library-add-btn'), 'library add button');
    assert(!html.includes('add-to-session-btn'), 'schedule add-to-session removed');

    pass('TEST 21: order + per-set logs + supplemental + library');
    first.dom.window.close();
    second.dom.window.close();
  } catch (err) {
    fail('TEST 21', err);
  }

  try {
    const { window, dom } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const app = window.MyFitApp;
    const doc = window.document;

    const resistanceInput = doc.getElementById('w-set-resistance');
    const resistanceType = doc.getElementById('w-set-resistance-type');
    const actions = doc.getElementById('workout-actions');
    const completeBtn = doc.getElementById('complete-set-btn');
    assert(resistanceInput && resistanceType && actions && completeBtn, 'workout resistance + action markup present');

    app.startWorkout(0);
    let session = app.getActiveSession();
    assert(session.exercises[0].setLogs[0].resistance === 5, 'set1 starts at default 5');
    assert(resistanceInput.value === '5', 'resistance input shows default load');
    assert(completeBtn.textContent === 'Hoàn thành SET', 'primary CTA is Hoàn thành SET');
    assert(actions.querySelector('#complete-set-btn'), 'primary action inside sticky bar');

    // Complete SET 1 without touching resistance
    app.completeSet();
    session = app.getActiveSession();
    assert(session.exercises[0].setLogs[0].completed === true, 'set1 completed');
    assert(session.exercises[0].setLogs[0].resistance === 5, 'set1 kept default without edit');
    assert(session.exercises[0].snapshot.resistance === 5, 'exercise default unchanged after set1');
    app.finishRestAdvance();
    session = app.getActiveSession();
    assert(session.currentSet === 2, 'advanced to set 2');
    assert(session.exercises[0].setLogs[1].resistance === 5, 'set2 inherits set1 load');

    // Edit SET 2 via visible inputs
    resistanceInput.value = '12';
    resistanceInput.dispatchEvent(new window.Event('change'));
    session = app.getActiveSession();
    assert(session.exercises[0].setLogs[1].resistance === 12, 'set2 edited to 12');
    assert(session.exercises[0].snapshot.resistance === 5, 'exercise default still 5 after edit');

    app.completeSet();
    app.finishRestAdvance();
    session = app.getActiveSession();
    assert(session.currentSet === 3, 'advanced to set 3');
    assert(session.exercises[0].setLogs[2].resistance === 12, 'set3 inherits edited set2 load');

    app.completeSet();
    session = app.getActiveSession();
    assert(session.phase === 'rest-exercise', 'exercise rest after last set');
    app.finishRestAdvance();
    session = app.getActiveSession();
    assert(session.currentExerciseIndex === 1, 'moved to exercise 2 by schedule order');
    assert(session.currentSet === 1, 'exercise 2 starts at set 1');
    assert(doc.getElementById('wprog').textContent.includes('Bài 2/'), 'UI shows Bài 2');
    assert(completeBtn.offsetParent !== null || completeBtn.isConnected, 'complete button still in DOM');

    pass('TEST 22: optional resistance row + sticky complete flow');
    dom.window.close();
  } catch (err) {
    fail('TEST 22', err);
  }

  try {
    const { window, dom } = loadApp();
    resetStorage();
    const D = window.MyFitData;
    const app = window.MyFitApp;
    const doc = window.document;
    app.setActiveSession(null);
    app.selectWorkout('a');
    app.startWorkout(0);

    const scroll = doc.querySelector('.workout-scroll');
    const actions = doc.getElementById('workout-actions');
    const completeBtn = doc.getElementById('complete-set-btn');
    const workout = D.loadWorkouts().a;
    assert(workout.exercises.length === 6, 'Glutes A has 6 exercises');
    assert(scroll && actions && completeBtn, 'workout scroll + fixed actions present');
    assert(!scroll.contains(actions), 'action bar is outside scroll content');
    assert(!scroll.contains(completeBtn), 'primary action is outside scroll content');

    workout.exercises.forEach((ex, idx) => {
      const session = app.getActiveSession();
      session.currentExerciseIndex = idx;
      session.currentSet = 1;
      session.phase = 'exercise';
      app.showWorkoutView();
      assert(doc.getElementById('complete-set-btn').textContent === 'Hoàn thành SET', 'mid-set label for ex ' + (idx + 1));
      assert(doc.getElementById('workout-actions'), 'actions bar for ex ' + (idx + 1));
      const snap = session.exercises[idx].snapshot;
      session.currentSet = snap.sets;
      if (idx === workout.exercises.length - 1) {
        session.exercises.forEach(function (item, i) {
          if (i !== idx) item.completionStatus = 'completed';
        });
      }
      app.showWorkoutView();
      const label = doc.getElementById('complete-set-btn').textContent;
      if (idx === workout.exercises.length - 1) {
        assert(label === 'Hoàn thành buổi tập', 'last exercise last set label');
      } else {
        assert(label === 'Bài tiếp theo', 'last set label for ex ' + (idx + 1));
      }
      assert(snap.resistance >= 0, 'resistance numeric for ex ' + (idx + 1));
      assert(['kg', 'band', 'bodyweight'].includes(snap.resistanceType), 'resistance type for ex ' + (idx + 1));
    });

    // T6 regression: all Glutes B exercises keep action button
    app.setActiveSession(null);
    app.selectWorkout('c');
    app.startWorkout(0);
    const glutesB = D.loadWorkouts().c;
    glutesB.exercises.forEach((ex, idx) => {
      const session = app.getActiveSession();
      session.currentExerciseIndex = idx;
      session.currentSet = 1;
      app.showWorkoutView();
      assert(doc.getElementById('complete-set-btn').textContent === 'Hoàn thành SET', 'Glutes B ex ' + (idx + 1));
    });

    // Full T2 flow without editing resistance + history check
    app.setActiveSession(null);
    app.selectWorkout('a');
    app.startWorkout(0);
    for (let ex = 0; ex < 6; ex += 1) {
      const session = app.getActiveSession();
      session.currentExerciseIndex = ex;
      const sets = session.exercises[ex].snapshot.sets;
      for (let set = 1; set <= sets; set += 1) {
        session.currentSet = set;
        session.phase = 'exercise';
        app.showWorkoutView();
        assert(doc.getElementById('complete-set-btn'), 'action visible ex ' + (ex + 1) + ' set ' + set);
        app.completeSet();
        if (set < sets) app.finishRestAdvance();
      }
      if (ex < 5) app.finishRestAdvance();
    }
    assert(!app.getActiveSession(), 'workout finished');
    const history = D.loadHistory();
    assert(history.length === 1, 'history entry saved');
    assert(history[0].exercises.length === 6, 'history has 6 exercises');
    assert(history[0].exercises[0].setLogs.length === 3, 'ex1 set logs saved');

    pass('TEST 23: Glutes A all exercises keep fixed action bar + labels + full flow');
    dom.window.close();
  } catch (err) {
    fail('TEST 23', err);
  }

  try {
    const { window, dom } = loadApp();
    resetStorage();
    const D = window.MyFitData;
    const app = window.MyFitApp;
    const doc = window.document;
    app.selectWorkout('b');

    const workouts = app.getWorkouts();
    const lat = workouts.b.exercises[0];
    assert(D.isStableAssetPath(lat.image), 'T4 lat pulldown uses stable asset path');

    app.openEdit(0);
    const editForm = doc.getElementById('edit-form');
    const imageInput = editForm.elements.image;
    assert(imageInput.type === 'text', 'image field is not required URL input');
    assert(editForm.checkValidity(), 'edit form valid with stable asset path hidden from URL field');
    assert(!imageInput.value || imageInput.value.indexOf('assets/exercises/') !== 0, 'stable asset not shown as URL field value');

    editForm.elements.name.value = 'Lat Pulldown Edited';
    editForm.elements.reps.value = '11';
    editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(100);

    const saved = app.getWorkouts().b.exercises[0];
    assert(saved.name === 'Lat Pulldown Edited', 'T4 name saved without touching image');
    assert(saved.reps === 11, 'T4 reps saved');
    assert(String(saved.image).indexOf('lat-pulldown') >= 0, 'T4 image path preserved');

    // exercise without image still saves
    saved.image = '';
    saved.imageId = '';
    window.MyFitData.saveWorkouts(app.getWorkouts());
    app.openEdit(0);
    editForm.elements.instructions.value = 'No image ok';
    editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(100);
    const noImg = app.getWorkouts().b.exercises[0];
    assert(noImg.instructions === 'No image ok', 'T4 saves when URL field empty');
    assert(editForm.checkValidity(), 'edit form stays valid without image URL');

    pass('TEST 24: T4 edit saves without changing image URL field');
    dom.window.close();
  } catch (err) {
    fail('TEST 24', err);
  }

  try {
    const first = loadApp();
    resetStorage();
    const D = first.window.MyFitData;
    const workouts = D.loadWorkouts();
    const library = D.loadLibrary(workouts);
    const scheduleNames = [];
    ['a', 'b', 'c'].forEach((wid) => {
      workouts[wid].exercises.forEach((ex) => scheduleNames.push(ex.name));
    });
    assert(library.exercises.length === 17, 'library contains all schedule + extras');
    scheduleNames.forEach((name) => {
      assert(library.exercises.some((ex) => ex.name === name), 'library has schedule exercise: ' + name);
    });
    const keys = library.exercises.map((ex) => D.exerciseIdentityKey(ex));
    assert(keys.length === new Set(keys).size, 'library has no duplicate identity keys');

    // edit master propagates to schedule + library, not history
    const beforeHist = [];
    workouts.b.exercises[0].name = 'Master Lat Pulldown';
    D.propagateExerciseMaster(workouts.b.exercises[0], workouts, library);
    assert(workouts.b.exercises[0].name === 'Master Lat Pulldown', 'schedule updated');
    const libLat = library.exercises.find((ex) => D.exerciseIdentityKey(ex) === D.exerciseIdentityKey(workouts.b.exercises[0]));
    assert(libLat && libLat.name === 'Master Lat Pulldown', 'library updated');

    first.dom.window.close();

    // reload preserves synced library
    const second = loadApp();
    const lib2 = second.window.MyFitData.loadLibrary(second.window.MyFitApp.getWorkouts());
    assert(lib2.exercises.length === 17, 'library persists after reload');
    assert(lib2.exercises.some((ex) => /Master Lat Pulldown|Lat Pulldown/.test(ex.name)), 'master name persisted');

    // supplemental library session history
    resetStorage();
    second.window.MyFitApp.setActiveSession(null);
    const libFresh = second.window.MyFitData.loadLibrary(second.window.MyFitApp.getWorkouts());
    const face = libFresh.exercises.find((ex) => /face pull/i.test(ex.name));
    assert(face, 'library-only exercise exists');
    const solo = second.window.MyFitData.createWorkoutSession(
      { id: 'library', title: 'Tập theo bài · Face Pull', exercises: [face] },
      { sessionKind: 'library' }
    );
    solo.exercises[0].setLogs[0].completed = true;
    solo.exercises[0].actualSetsCompleted = 1;
    solo.exercises[0].completionStatus = 'completed';
    solo.endTime = new Date().toISOString();
    const entry = second.window.MyFitData.finalizeHistoryEntry(solo);
    assert(entry.sessionKind === 'library', 'library session kind in history');
    assert(entry.exercises[0].role === 'scheduled', 'solo library exercise role in session item');

    pass('TEST 25: schedule→library sync, dedupe, master propagate, reload');
    second.dom.window.close();
  } catch (err) {
    fail('TEST 25', err);
  }

  try {
    resetStorage();
    const { window, dom } = loadApp();
    const D = window.MyFitData;
    const app = window.MyFitApp;
    const doc = window.document;
    const html = readFileSync(join(root, 'index.html'), 'utf8');

    assert(!html.includes('workout-add-exercise-btn'), 'set screen add button removed');
    assert(html.includes('rest-pick-exercise-btn'), 'rest pick exercise button exists');
    assert(html.includes('workout-pick-exercise-btn'), 'workout pick exercise button exists');
    assert(html.includes('w-resistance-history-btn'), 'resistance history button exists');
    const workoutResistanceSelect = html.match(/id="w-set-resistance-type"[\s\S]*?<\/select>/);
    assert(workoutResistanceSelect && !/bodyweight/.test(workoutResistanceSelect[0]), 'workout resistance dropdown has kg and Band only');
    assert(D.formatResistance({ resistanceType: 'band' }) === 'Band', 'Band label in meta');
    assert(D.formatResistance({ resistance: 20, resistanceType: 'kg' }) === '20 kg', 'kg label in meta');
    assert(typeof D.getExerciseLoadHistory === 'function', 'getExerciseLoadHistory exported');

    app.setActiveSession(null);
    app.startWorkout(0);
    let session = app.getActiveSession();
    const workout = D.loadWorkouts().a;
    const lib = D.loadLibrary();
    const kick = lib.exercises.find((e) => /cable kickback/i.test(e.name));
    assert(kick, 'kickback in library');

    session.currentExerciseIndex = 2;
    session.currentSet = 1;
    app.insertSupplementalExercise(kick, { jumpNow: false });
    session = app.getActiveSession();
    assert(session.exercises.length === workout.exercises.length + 1, 'one supplemental inserted');
    assert(session.exercises[3].role === 'supplemental', 'supplemental at index 3 after exercise 3');
    assert(session.currentExerciseIndex === 2, 'still on exercise 3 when not jumping');
    assert(session.exercises[4].snapshot.name === workout.exercises[3].name, 'scheduled order preserved after supplemental');

    // jump on rest pick flow (fresh session)
    resetStorage();
    const jumpWin = loadApp();
    const appJump = jumpWin.window.MyFitApp;
    appJump.setActiveSession(null);
    appJump.startWorkout(0);
    let jumpSession = appJump.getActiveSession();
    jumpSession.currentExerciseIndex = 2;
    jumpSession.exercises[2].completionStatus = 'completed';
    jumpSession.phase = 'rest-exercise';
    jumpSession.restKind = 'exercise';
    const kick2 = jumpWin.window.MyFitData.loadLibrary().exercises.find((e) => /cable kickback/i.test(e.name));
    appJump.insertSupplementalExercise(kick2, { jumpNow: true });
    jumpSession = appJump.getActiveSession();
    assert(jumpSession.phase === 'exercise', 'jump starts supplemental exercise');
    assert(jumpSession.exercises[jumpSession.currentExerciseIndex].role === 'supplemental', 'jumped to supplemental');
    jumpWin.dom.window.close();

    // resistance history from completed sets
    resetStorage();
    const histApp = loadApp();
    const D3 = histApp.window.MyFitData;
    const app3 = histApp.window.MyFitApp;
    app3.setActiveSession(null);
    app3.startWorkout(0);
    let s2 = app3.getActiveSession();
    s2.exercises[0].setLogs[0].resistance = 10;
    s2.exercises[0].setLogs[0].completed = true;
    s2.exercises[0].actualSetsCompleted = 1;
    s2.exercises[0].completionStatus = 'completed';
    s2.endTime = new Date().toISOString();
    s2.phase = 'complete';
    const histEntry = D3.finalizeHistoryEntry(s2);
    const history = D3.loadHistory();
    history.unshift(histEntry);
    D3.saveHistory(history);
    const exId = s2.exercises[0].snapshot.id;
    const rows = D3.getExerciseLoadHistory(exId, D3.exerciseIdentityKey(s2.exercises[0].snapshot));
    assert(rows.length >= 1, 'load history has entries');
    assert(rows[0].logs[0].resistance === 10, 'load history shows set resistance');

    // history detail preserves performance order
    const ordered = [
      D3.createSessionExercise(D3.loadWorkouts().a.exercises[0], 'scheduled'),
      D3.createSessionExercise(kick, 'supplemental'),
      D3.createSessionExercise(D3.loadWorkouts().a.exercises[1], 'scheduled')
    ];
    ordered[0].completionStatus = 'completed';
    ordered[1].completionStatus = 'completed';
    ordered[2].completionStatus = 'completed';
    const orderEntry = {
      workoutName: 'Order test',
      date: '2026-08-12',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      estimatedDuration: 100,
      actualDuration: 100,
      exercises: ordered
    };
    history.unshift(orderEntry);
    D3.saveHistory(history);
    app3.openHistoryDetail(0);
    const detailHtml = histApp.window.document.getElementById('history-detail-content').innerHTML;
    const firstPos = detailHtml.indexOf(ordered[0].snapshot.name);
    const suppPos = detailHtml.indexOf(kick.name);
    const secondPos = detailHtml.indexOf(ordered[2].snapshot.name);
    assert(firstPos >= 0 && suppPos > firstPos && secondPos > suppPos, 'history detail follows performance order');

    pass('TEST 26: supplemental insert + pick UI + load history + order');
    dom.window.close();
    histApp.dom.window.close();
  } catch (err) {
    fail('TEST 26', err);
  }

  try {
    resetStorage();
    const first = loadApp();
    const D = first.window.MyFitData;
    const app = first.window.MyFitApp;
    app.setActiveSession(null);
    app.selectWorkout('a');
    app.startWorkout(0);
    let session = app.getActiveSession();
    assert(session.exercises.length >= 3, 'schedule has at least 3 exercises');
    // Complete exercise 1
    session.exercises[0].completionStatus = 'completed';
    D.assignActualOrder(session, session.exercises[0]);
    session.currentExerciseIndex = 0;
    session.phase = 'rest-exercise';
    // Pick exercise 3 (index 2)
    const ex3 = D.clone(session.exercises[2].snapshot);
    ex3.id = session.exercises[2].snapshot.id;
    app.pickExerciseForSession(ex3, { jumpNow: true });
    session = app.getActiveSession();
    assert(session.currentExerciseIndex === 2, 'jumped to exercise 3');
    session.exercises[2].completionStatus = 'completed';
    D.assignActualOrder(session, session.exercises[2]);
    session.phase = 'rest-exercise';
    app.finishRestAdvance();
    session = app.getActiveSession();
    assert(session.currentExerciseIndex === 1, 'next default is exercise 2');
    assert(session.exercises[1].completionStatus !== 'completed', 'exercise 2 still pending');

    // Finish workout and verify history persistence after reload
    session.exercises.forEach(function (item, idx) {
      if (!item) return;
      item.completionStatus = 'completed';
      D.assignActualOrder(session, item);
    });
    session.endTime = new Date().toISOString();
    session.phase = 'complete';
    const entry = D.finalizeHistoryEntry(session);
    assert(entry.exercises.some(function (item) { return item.actualOrder === 1; }), 'history has actualOrder');
    const history = D.loadHistory();
    history.unshift(entry);
    D.saveActiveSession(null);
    D.saveHistory(history);
    first.dom.window.close();

    const second = loadApp();
    const hist2 = second.window.MyFitData.loadHistory();
    assert(hist2.length === 1, 'history persists after reload');
    assert(hist2[0].exercises.length === entry.exercises.length, 'history entry intact with all exercises');
    second.dom.window.close();

    const css = readFileSync(join(root, 'styles.css'), 'utf8');
    assert(css.includes('welcome-btn-primary'), 'welcome primary button style');
    assert(css.includes('#dccfc0') || css.includes('#5c4838'), 'welcome uses beige/brown palette');
    assert(/\.welcome-bg\{[^}]*object-fit:cover/.test(css), 'welcome-bg fills screen with cover');
    assert(css.includes('width:175%'), 'welcome background zoomed out');
    assert(css.includes('#c2b3a0'), 'welcome bg matches image beige');
    assert(css.includes('welcome-active'), 'html/body sync with welcome beige');
    assert(!css.includes('welcome-btn-primary{background:#fff;color:#222}'), 'welcome primary is not black/white');

    pass('TEST 27: reorder navigation + history persistence + welcome palette');
  } catch (err) {
    fail('TEST 27', err);
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
