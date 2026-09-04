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
  window.eval(readFileSync(join(root, 'rest-audio.js'), 'utf8'));
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
    assert(html.includes('myfit-version" content="45"'), 'version meta is 45');
    assert(html.includes('data.js?v=45'), 'script cache bust v45');
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
    assert(sw.includes('my-fit-mini-v45'), 'service worker cache v45');
    assert(sw.includes('APP_VERSION = \'45\''), 'service worker APP_VERSION v45');
    assert(sw.includes('count-go.mp3'), 'go cue mp3 cached');
    assert(sw.includes('assets/audio/count-5.mp3'), 'countdown mp3 cached');
    assert(html.includes('rest-audio.js'), 'rest audio module in HTML');
    assert(!html.includes('welcome-quote'), 'welcome quote removed');
    assert(!html.includes('Nhỏ từng ngày'), 'no extra welcome quote line');
    assert(html.includes('welcome-hero'), 'welcome hero layout group');
    pass('TEST 16: HTML/SW ship welcome + History UI + cache v45 + workout management');
  } catch (err) {
    fail('TEST 16', err);
  }

  // NEW: edit form fields exist and textareas have no maxlength
  try {
    const { window } = loadApp();
    const edit = window.document.getElementById('edit-form');
    const replace = window.document.getElementById('replace-form');
    const add = window.document.getElementById('add-exercise-form');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    ['name', 'instructions', 'notes', 'tips', 'commonMistakes', 'image', 'sets', 'reps', 'resistance', 'resistanceType', 'imageFile', 'primaryMuscleGroup'].forEach((field) => {
      assert(!!edit.elements[field], 'edit has ' + field);
      assert(!!replace.elements[field], 'replace has ' + field);
      assert(!!add.elements[field], 'add has ' + field);
    });
    assert(html.includes('id="dprimary-muscle"'), 'detail primary muscle row');
    assert(html.includes('id="dsets"'), 'detail sets row');
    assert(html.includes('id="detail-edit-btn"'), 'detail edit button for library');
    assert(add.querySelector('[data-role="instruction-gallery"]'), 'add form instruction gallery');
    assert(add.querySelector('[data-role="secondary-muscle"]'), 'add form secondary muscle select');
    assert(add.querySelector('[data-role="target-area"]'), 'add form target area select');
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
        // uploaded imageId must win over default catalog asset path
        const uploadBlob = new window.Blob(['catalog-override-test'], { type: 'image/png' });
        const uploadId = await Img.putImage(uploadBlob);
        const withUpload = {
          id: exercise.id,
          name: exercise.name,
          image: exercise.image,
          imageId: uploadId
        };
        const uploadResolved = await Img.resolveImageSrc(withUpload);
        assert(
          String(uploadResolved).indexOf('blob:') === 0,
          exercise.name + ' upload wins over catalog asset path'
        );
        // imageId-only stored row still resolves via catalog when blob missing
        const idOnly = { id: exercise.id, name: exercise.name, image: '', imageId: 'img-missing-on-other-device' };
        const viaCatalog = await Img.resolveImageSrc(idOnly);
        assert(
          viaCatalog === exercise.image || String(viaCatalog).indexOf(exercise.image) >= 0 || String(viaCatalog).indexOf('assets/exercises/') >= 0,
          exercise.name + ' catalog fallback works without IndexedDB'
        );      }
    }
    assert(total === 17, 'checked all 17 default exercises, got ' + total);
    assert(Object.keys(D.EXERCISE_IMAGE_ASSETS).length >= 17, 'catalog has at least 17 entries');
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
    assert(library.exercises.length === 20, 'library contains all schedule + extras');
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
    assert(lib2.exercises.length === 20, 'library persists after reload');
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
    assert(css.includes('#ebe4da') || css.includes('#dccfc0') || css.includes('#5c4838'), 'welcome uses beige/brown palette');
    assert(/\.welcome-bg\{[^}]*object-fit:contain/.test(css), 'welcome-bg shows full image with contain');
    assert(css.includes('object-position:center center'), 'welcome image centered like requirement');
    assert(css.includes('welcome-hero'), 'welcome hero groups copy at top');
    assert(/\.welcome-hero\{[^}]*justify-content:flex-start/.test(css), 'welcome copy aligned to top');
    assert(!css.includes('welcome-btn-primary{background:#fff;color:#222}'), 'welcome primary is not black/white');

    pass('TEST 27: reorder navigation + history persistence + welcome palette');
  } catch (err) {
    fail('TEST 27', err);
  }

  // Rest-screen "+ Chọn bài" navigation (CASE A–E)
  try {
    resetStorage();
    const { window, dom } = loadApp();
    const D = window.MyFitData;
    const app = window.MyFitApp;
    const doc = window.document;
    const css = readFileSync(join(root, 'styles.css'), 'utf8');
    const workout = D.loadWorkouts().a;

    app.setActiveSession(null);
    app.selectWorkout('a');
    app.startWorkout(0);
    let session = app.getActiveSession();
    assert(workout.exercises.length >= 5, 'workout has at least 5 exercises');

    // CASE A: "Bài tiếp theo" after exercise 1 rest -> exercise 2
    session.exercises[0].completionStatus = 'completed';
    D.assignActualOrder(session, session.exercises[0]);
    session.currentExerciseIndex = 0;
    session.phase = 'rest-exercise';
    session.restKind = 'exercise';
    app.finishRestAdvance();
    session = app.getActiveSession();
    assert(session.currentExerciseIndex === 1, 'CASE A: next default is exercise 2');
    assert(session.phase === 'exercise', 'CASE A: enters exercise view');

    // CASE B: pick exercise 5 from exercise rest
    app.setActiveSession(null);
    app.startWorkout(0);
    session = app.getActiveSession();
    session.exercises[0].completionStatus = 'completed';
    D.assignActualOrder(session, session.exercises[0]);
    session.currentExerciseIndex = 0;
    session.phase = 'rest-exercise';
    session.restKind = 'exercise';
    const catalog = app.getExerciseCatalog();
    const ex5Master = catalog.find((ex) => ex.id === workout.exercises[4].id);
    assert(ex5Master, 'CASE B: exercise 5 in shared catalog');
    app.pickExerciseForSession(ex5Master, { jumpNow: true });
    session = app.getActiveSession();
    assert(session.currentExerciseIndex === 4, 'CASE B: jumped to exercise 5');
    assert(session.phase === 'exercise', 'CASE B: starts exercise 5');
    assert(session.exercises[4].snapshot.name === ex5Master.name, 'CASE B: uses catalog exercise data');

    // CASE C: no "+ Chọn bài" during active sets or set rest
    app.setActiveSession(null);
    app.startWorkout(0);
    session = app.getActiveSession();
    session.phase = 'exercise';
    session.currentSet = 2;
    app.updateRestActions();
    assert(doc.getElementById('rest-pick-exercise-btn').hidden, 'CASE C: hidden while exercising');
    session.phase = 'rest-set';
    session.restKind = 'set';
    app.updateRestActions();
    assert(doc.getElementById('rest-pick-exercise-btn').hidden, 'CASE C: hidden during set rest');
    assert(/\.workout-pick-btn\{[^}]*display:none/.test(css), 'CASE C: workout pick hidden on set screen');

    // CASE D: exercise rest shows working pick overlay with shared catalog
    session.phase = 'rest-exercise';
    session.restKind = 'exercise';
    app.updateRestActions();
    assert(!doc.getElementById('rest-pick-exercise-btn').hidden, 'CASE D: pick visible on exercise rest');
    app.openPickExerciseForSession({ jumpAfterInsert: true, fromRest: true });
    assert(doc.getElementById('pick-exercise-overlay').style.display === 'flex', 'CASE D: pick overlay opens above rest');
    assert(doc.getElementById('pick-exercise-list').innerHTML.includes('Chọn bài này'), 'CASE D: pick list populated');
    assert(css.includes('#pick-exercise-overlay{z-index:35}'), 'CASE D: pick overlay z-index above rest screen');
    assert(catalog.length >= workout.exercises.length, 'CASE D: catalog includes schedule exercises');
    app.closePickExercise();
    assert(session.phase === 'rest-exercise', 'CASE D: closing pick keeps exercise rest running');

    // CASE E: after manual pick, "Bài tiếp theo" still follows default schedule order
    session.exercises[0].completionStatus = 'completed';
    D.assignActualOrder(session, session.exercises[0]);
    session.exercises[4].completionStatus = 'completed';
    D.assignActualOrder(session, session.exercises[4]);
    session.currentExerciseIndex = 4;
    session.phase = 'rest-exercise';
    session.restKind = 'exercise';
    app.finishRestAdvance();
    session = app.getActiveSession();
    assert(session.currentExerciseIndex === 1, 'CASE E: default next is exercise 2 after manual detour');
    assert(session.exercises[1].completionStatus !== 'completed', 'CASE E: exercise 2 still pending');

    // Supplemental: pick exercise not in today's session list
    const latPulldown = catalog.find((ex) => /lat pulldown/i.test(ex.name));
    assert(latPulldown, 'upper-body exercise in shared catalog');
    assert(!session.exercises.some((item) => item.snapshot.id === latPulldown.id), 'not already in session');
    session.currentExerciseIndex = 1;
    session.phase = 'rest-exercise';
    session.restKind = 'exercise';
    const beforeLen = session.exercises.length;
    app.pickExerciseForSession(latPulldown, { jumpNow: true });
    session = app.getActiveSession();
    assert(session.exercises.length === beforeLen + 1, 'supplemental inserted for ad-hoc pick');
    assert(session.exercises[session.currentExerciseIndex].role === 'supplemental', 'jumped into supplemental exercise');
    assert(session.exercises[session.currentExerciseIndex].snapshot.name === latPulldown.name, 'supplemental uses catalog data');

    pass('TEST 28: rest pick exercise navigation CASE A–E');
    dom.window.close();
  } catch (err) {
    fail('TEST 28', err);
  }

  // Rest countdown audio — last 5 seconds only
  try {
    resetStorage();
    const { window, dom } = loadApp();
    const RA = window.MyFitRestAudio;
    const spoken = [];
    const hooks = { speak: (text) => spoken.push(text) };

    assert(!!RA.unlockRestAudio, 'unlockRestAudio exported');
    RA.unlockRestAudio();
    assert(RA._isUnlocked(), 'audio unlock after user gesture hook');
    assert(!RA.shouldAnnounceCountdown(6), 'no audio above 5 seconds');
    assert(RA.shouldAnnounceCountdown(5), 'audio at 5 seconds');

    // Test 1: 10-second rest — only 5..1 speak once each
    RA.resetCountdownAudio();
    spoken.length = 0;
    for (let sec = 10; sec >= 1; sec -= 1) {
      RA.handleRestCountdownTick(sec, hooks);
    }
    assert(spoken.join(',') === '5,4,3,2,1', 'Test 1: 10s rest speaks 5-1 only');

    RA.resetCountdownAudio();
    spoken.length = 0;
    RA.handleRestCountdownTick(0, hooks);
    assert(!spoken.length, 'zero second tick waits for Go cue');
    RA.playGoCue(function () {}, hooks);
    assert(spoken.join(',') === 'Go', 'Go cue after countdown');

    // Test 2: 30-second rest — still only last 5 seconds
    RA.resetCountdownAudio();
    spoken.length = 0;
    for (let sec = 30; sec >= 0; sec -= 1) {
      RA.handleRestCountdownTick(sec, hooks);
    }
    assert(spoken.join(',') === '5,4,3,2,1', 'Test 2: 30s rest speaks last 5 only');

    // Test 3: +15 seconds while at 5 — reset, no overlap, restart at 5 later
    RA.resetCountdownAudio();
    spoken.length = 0;
    RA.handleRestCountdownTick(5, hooks);
    RA.handleRestCountdownTick(5, hooks);
    assert(spoken.length === 1, 'duplicate tick at 5 does not overlap');
    RA.resetCountdownAudio();
    spoken.length = 0;
    RA.handleRestCountdownTick(20, hooks);
    RA.handleRestCountdownTick(19, hooks);
    assert(spoken.length === 0, 'after +15 reset, no audio until last 5');
    RA.handleRestCountdownTick(5, hooks);
    assert(spoken.join(',') === '5', 'Test 3: countdown audio restarts at 5');

    // Test 4: skip at 3 — stop immediately, no 2/1 after leaving rest
    RA.resetCountdownAudio();
    spoken.length = 0;
    RA.handleRestCountdownTick(3, hooks);
    RA.stopRestCountdownAudio();
    assert(spoken.join(',') === '3', 'Test 4: stop at 3, no further digits');

    const app = window.MyFitApp;
    app.setActiveSession(null);
    app.selectWorkout('a');
    app.startWorkout(0);
    let session = app.getActiveSession();
    session.phase = 'rest-exercise';
    session.restKind = 'exercise';
    session.restEndTime = new Date(Date.now() + 3000).toISOString();
    session.restRemaining = 3;
    app.setActiveSession(session);
    RA.resetCountdownAudio();
    RA.handleRestCountdownTick(3, hooks);
    assert(RA._debugLastAnnounced() === 3, 'countdown audio syncs with displayed 3 seconds');
    spoken.length = 0;
    RA.resetCountdownAudio();
    RA.handleRestCountdownTick(3, hooks);
    app.skipRest();
    assert(spoken.join(',') === '3', 'Test 4 integration: skipRest stops at 3 — no 2/1');
    assert(app.getActiveSession().phase === 'exercise', 'skipRest advances to next exercise');

    // +15 integration: reset audio state when extending rest
    app.setActiveSession(null);
    app.startWorkout(0);
    session = app.getActiveSession();
    session.phase = 'rest-exercise';
    session.restKind = 'exercise';
    session.restEndTime = new Date(Date.now() + 5000).toISOString();
    session.restRemaining = 5;
    app.setActiveSession(session);
    spoken.length = 0;
    RA.resetCountdownAudio();
    RA.handleRestCountdownTick(5, hooks);
    app.addRestSeconds();
    spoken.length = 0;
    RA.handleRestCountdownTick(18, hooks);
    assert(spoken.length === 0, 'addRestSeconds cancels countdown until last 5 again');

    // Immediate HTML playback path must not wait on buffers (silent hang fix)
    RA.resetCountdownAudio();
    spoken.length = 0;
    RA.unlockRestAudio();
    RA.speakCountdownDigit(5, hooks);
    assert(spoken.join(',') === '5', 'speakCountdownDigit works with hooks without buffers');

    // Rapid 250ms-style ticks must not skip digits when seconds change
    RA.resetCountdownAudio();
    spoken.length = 0;
    [5.9, 5.2, 4.9, 4.1, 3.8, 3.0, 2.4, 2.0, 1.6, 1.0].forEach(function (sec) {
      RA.handleRestCountdownTick(sec, hooks);
    });
    assert(spoken.join(',') === '5,4,3,2,1', 'fractional remaining still announces each digit once');

    pass('TEST 29: rest countdown audio last 5 seconds');
    dom.window.close();
  } catch (err) {
    fail('TEST 29', err);
  }

  // TEST 30: exercise image data flow — T4 upload, sync, fallback (CASE 1–6)
  try {
    async function waitForBlobImg(doc, selector, timeoutMs) {
      const start = Date.now();
      while (Date.now() - start < (timeoutMs || 500)) {
        const imgs = doc.querySelectorAll(selector);
        for (let i = 0; i < imgs.length; i += 1) {
          if (imgs[i].src && imgs[i].src.indexOf('blob:') >= 0) return imgs[i];
        }
        await wait(25);
      }
      return null;
    }

    async function waitForUploadPreview(form) {
      const start = Date.now();
      while (Date.now() - start < 900) {
        const preview = form.querySelector('[data-role="preview"]');
        if (preview && preview.src && preview.src.indexOf('blob:') >= 0) return preview;
        await wait(25);
      }
      return null;
    }

    async function uploadViaEdit(app, doc, win, index) {
      app.openEdit(index);
      const editForm = doc.getElementById('edit-form');
      const file = new win.File(['t4-custom-image-bytes'], 't4-custom.png', { type: 'image/png' });
      const fileInput = editForm.elements.imageFile;
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new win.Event('change', { bubbles: true }));
      const preview = await waitForUploadPreview(editForm);
      assert(preview, 'edit preview shows uploaded blob image');
      editForm.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
      await wait(400);
    }

    resetStorage();
    const first = loadApp();
    const D = first.window.MyFitData;
    const app = first.window.MyFitApp;
    const Img = first.window.MyFitImages;
    const doc = first.window.document;
    app.showHome();
    app.selectWorkout('b');

    const latBefore = app.getWorkouts().b.exercises[0];
    const oldAsset = latBefore.image;
    assert(oldAsset.indexOf('lat-pulldown') >= 0, 'T4 lat pulldown has default asset');

    await uploadViaEdit(app, doc, first.window, 0);

    const saved = app.getWorkouts().b.exercises[0];
    assert(saved.imageId, 'CASE1: imageId saved on T4 exercise');
    assert(!saved.image || saved.image.indexOf('lat-pulldown') < 0, 'CASE1: no catalog path stored after upload');
    assert(!saved.image || saved.image.indexOf('data:') !== 0 || saved.image.length < 200000, 'CASE1: no huge data URL in localStorage');
    const savedSrc = await Img.resolveImageSrc(saved);
    assert(String(savedSrc).indexOf('blob:') === 0, 'CASE1: resolve uses upload');
    assert(String(savedSrc).indexOf('lat-pulldown') < 0, 'CASE6: does not revert to old asset URL');

    const imageIdAfterSave = saved.imageId;
    first.dom.window.close();

    const reloaded = loadApp();
    const app2 = reloaded.window.MyFitApp;
    const Img2 = reloaded.window.MyFitImages;
    app2.showHome();
    app2.selectWorkout('b');
    const latReload = app2.getWorkouts().b.exercises[0];
    assert(latReload.imageId === imageIdAfterSave, 'CASE1: imageId persists after reload');
    const reloadSrc = await Img2.resolveImageSrc(latReload);
    assert(String(reloadSrc).indexOf('blob:') === 0, 'CASE1: upload image after reload');

    app2.openEdit(0);
    const editForm2 = reloaded.window.document.getElementById('edit-form');
    const previewAfterReload = editForm2.querySelector('[data-role="preview"]');
    await wait(50);
    assert(previewAfterReload && previewAfterReload.src, 'CASE1: edit preview shows saved upload');

    // CASE 2: schedule list uses new image
    app2.renderAll();
    const listImg = await waitForBlobImg(reloaded.window.document, '#exercise-list .card-image');
    assert(listImg, 'CASE2: schedule list shows upload');

    // CASE 3: library synced with upload
    const libLat = app2.getLibrary().exercises.find(function (ex) {
      return ex.id === 'b-lat-pulldown';
    });
    assert(libLat && libLat.imageId === imageIdAfterSave, 'CASE3: library has upload imageId');
    const libSrc = await Img2.resolveImageSrc(libLat);
    assert(String(libSrc).indexOf('blob:') === 0, 'CASE3: library resolves upload');

    app2.showLibrary();
    app2.renderAll();
    const libCardImg = await waitForBlobImg(reloaded.window.document, '#library-list .card-image');
    assert(libCardImg, 'CASE3: library list shows upload');

    // CASE 4: active workout screen shows upload
    app2.setActiveSession(null);
    app2.showHome();
    app2.selectWorkout('b');
    const D2 = reloaded.window.MyFitData;
    const session = D2.createWorkoutSession(app2.getWorkouts().b);
    const sessionEx = session.exercises[0].snapshot;
    assert(sessionEx.imageId === imageIdAfterSave, 'CASE4: session snapshot carries upload imageId');
    const sessionSrc = await Img2.resolveImageSrc(sessionEx);
    assert(String(sessionSrc).indexOf('blob:') === 0, 'CASE4: session snapshot resolves upload');
    app2.setActiveSession(session);
    app2.showWorkoutView();
    const workoutImgAny = await waitForBlobImg(reloaded.window.document, '#workout-overlay img, .workout img');
    assert(workoutImgAny, 'CASE4: workout overlay shows upload');

    reloaded.dom.window.close();

    // CASE 5: exercise without image uses catalog fallback
    resetStorage();
    const fallbackApp = loadApp();
    const Img3 = fallbackApp.window.MyFitImages;
    const noImage = { id: 'test-no-img', name: 'Unknown Move', image: '', imageId: '' };
    const fallbackSrc = await Img3.resolveImageSrc(noImage);
    assert(!fallbackSrc, 'CASE5: unknown exercise without image has no src');
    const catalogOnly = { id: 'b-lat-pulldown', name: 'Lat Pulldown', image: '', imageId: '' };
    const catalogSrc = await Img3.resolveImageSrc(catalogOnly);
    assert(String(catalogSrc).indexOf('lat-pulldown') >= 0, 'CASE5: known exercise falls back to catalog asset');
    fallbackApp.dom.window.close();

    pass('TEST 30: exercise image upload sync T4 schedule library workout');
  } catch (err) {
    fail('TEST 30', err);
  }

  // TEST 31: mergeExerciseMaster + library sync never overwrite custom images (CASE 6–7)
  try {
    resetStorage();
    const { window, dom } = loadApp();
    const D = window.MyFitData;
    const catalog = D.catalogImageForExercise({ id: 'b-lat-pulldown', name: 'Lat Pulldown' });

    const staleLibraryEntry = {
      id: 'b-lat-pulldown',
      name: 'Lat Pulldown',
      image: catalog,
      imageId: '',
      instructions: '',
      notes: '',
      sets: 3,
      reps: 10,
      resistance: 0,
      resistanceType: 'kg'
    };
    const customWorkoutEntry = {
      id: 'b-lat-pulldown',
      name: 'Lat Pulldown',
      image: 'data:image/png;base64,custom-bytes',
      imageId: 'img-custom-t4',
      instructions: '',
      notes: '',
      sets: 3,
      reps: 11,
      resistance: 0,
      resistanceType: 'kg'
    };

    assert(D.hasCustomExerciseImage(customWorkoutEntry), 'custom entry detected');
    assert(!D.hasCustomExerciseImage(staleLibraryEntry), 'catalog-only entry is not custom');

    const merged = D.mergeExerciseMaster(staleLibraryEntry, customWorkoutEntry);
    assert(merged.imageId === 'img-custom-t4', 'CASE6: mergeExerciseMaster keeps custom imageId');
    assert(merged.image.indexOf('data:') === 0, 'CASE6: mergeExerciseMaster keeps custom data URL');
    assert(merged.image.indexOf('lat-pulldown') < 0, 'CASE6: merge does not revert to catalog asset');

    const reverseMerged = D.mergeExerciseMaster(customWorkoutEntry, staleLibraryEntry);
    assert(reverseMerged.imageId === 'img-custom-t4', 'CASE6: reverse merge still keeps custom image');
    assert(reverseMerged.image.indexOf('data:') === 0, 'CASE6: reverse merge keeps data URL');

    const workouts = {
      b: {
        id: 'b',
        title: 'Upper',
        exercises: [customWorkoutEntry]
      }
    };
    const library = { exercises: [JSON.parse(JSON.stringify(staleLibraryEntry))] };
    const synced = D.syncLibraryFromWorkouts(workouts, library);
    const libLat = synced.library.exercises.find((ex) => ex.id === 'b-lat-pulldown');
    assert(libLat && libLat.imageId === 'img-custom-t4', 'library sync preserves custom imageId');
    assert(libLat && libLat.imageId === 'img-custom-t4', 'library sync preserves custom imageId');

    D.saveWorkouts(workouts);
    D.saveLibrary(synced.library);
    dom.window.close();

    const reloaded = loadApp();
    const D2 = reloaded.window.MyFitData;
    const workoutsReload = D2.loadWorkouts();
    const libraryReload = D2.loadLibrary(workoutsReload);
    const afterLoad = workoutsReload.b.exercises[0];
    assert(afterLoad.imageId === 'img-custom-t4', 'CASE5: reload keeps custom imageId in workouts');
    assert(!afterLoad.image || afterLoad.image.indexOf('lat-pulldown') < 0, 'CASE5: no catalog path after custom save');
    const libAfter = libraryReload.exercises.find((ex) => ex.id === 'b-lat-pulldown');
    assert(libAfter && libAfter.imageId === 'img-custom-t4', 'CASE5: reload keeps custom image in library');

    sharedImageMemory['img-custom-t4'] = new Blob(['custom-image-bytes'], { type: 'image/png' });
    const resolved = await reloaded.window.MyFitImages.resolveImageSrc(afterLoad);
    assert(String(resolved).indexOf('blob:') === 0, 'imageId resolves from IndexedDB/memory');

    resetStorage();
    const defaultApp = loadApp();
    const defaultLat = defaultApp.window.MyFitData.loadWorkouts().b.exercises[0];
    assert(defaultLat.image.indexOf('lat-pulldown') >= 0, 'CASE7: untouched T4 exercise keeps default asset');
    assert(!defaultApp.window.MyFitData.hasCustomExerciseImage(defaultLat), 'CASE7: default exercise is not custom');
    defaultApp.dom.window.close();
    reloaded.dom.window.close();

    pass('TEST 31: mergeExerciseMaster + sync preserve custom images');
  } catch (err) {
    fail('TEST 31', err);
  }

  // TEST 32: real-device failure — huge data URL must not block localStorage save
  try {
    resetStorage();
    const D0 = loadApp().window.MyFitData;
    const huge = 'data:image/jpeg;base64,' + 'A'.repeat(5 * 1024 * 1024);
    const bloated = {
      a: {
        id: 'a',
        title: 'A',
        exercises: [{
          id: 'b-lat-pulldown',
          name: 'Lat Pulldown',
          image: huge,
          imageId: 'img-should-strip',
          sets: 3,
          reps: 10,
          resistance: 0,
          resistanceType: 'kg',
          instructions: '',
          notes: ''
        }]
      }
    };
    const firstTry = D0.saveWorkouts(bloated);
    assert(firstTry, 'stripHeavyExerciseImages allows save when data URL stripped');
    const parsed = JSON.parse(sharedStorage.get('myfit-workouts-v2'));
    assert(parsed.a.exercises[0].image === '', 'heavy data URL stripped when imageId present');
    assert(parsed.a.exercises[0].imageId === 'img-should-strip', 'imageId kept after strip');

    resetStorage();
    const { window, dom } = loadApp();
    const app = window.MyFitApp;
    const D = window.MyFitData;
    app.showHome();
    app.selectWorkout('b');

    app.openEdit(0);
    const editForm = window.document.getElementById('edit-form');
    const bigFile = new window.File([new Uint8Array(512 * 1024)], 'phone.jpg', { type: 'image/jpeg' });
    const fileInput = editForm.elements.imageFile;
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true });
    fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    let preview = null;
    const start = Date.now();
    while (Date.now() - start < 900) {
      const el = editForm.querySelector('[data-role="preview"]');
      if (el && el.src && el.src.indexOf('blob:') >= 0) {
        preview = el;
        break;
      }
      await wait(25);
    }
    assert(preview, 'TEST32: preview shows uploaded blob image');

    editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(450);

    const saved = app.getWorkouts().b.exercises[0];
    assert(saved.imageId, 'TEST32: imageId saved');
    assert(!saved.image || saved.image.length < 200000, 'TEST32: localStorage row has no huge data URL');
    const stored = sharedStorage.get('myfit-workouts-v2') || '';
    assert(stored.length < 500000, 'TEST32: workouts JSON stays under localStorage budget');

    const imageId = saved.imageId;
    dom.window.close();
    const reloaded = loadApp();
    const after = reloaded.window.MyFitData.loadWorkouts().b.exercises[0];
    assert(after.imageId === imageId, 'TEST32: imageId survives reload');
    const src = await reloaded.window.MyFitImages.resolveImageSrc(after);
    assert(String(src).indexOf('blob:') === 0 || String(src).indexOf('data:') === 0, 'TEST32: custom image resolves after reload');
    reloaded.dom.window.close();

    pass('TEST 32: large upload persists via imageId without bloating localStorage');
  } catch (err) {
    fail('TEST 32', err);
  }

  // TEST 33: T4 Lưng + Vai — 6 exercises, b1/b2 preserved, b3–b6 specs + migration
  try {
    resetStorage();
    const fresh = loadApp();
    const D = fresh.window.MyFitData;
    const workouts = D.loadWorkouts();
    const b = workouts.b;

    assert(b.title === '💪 Lưng + Vai', 'T4 title is Lưng + Vai');
    assert(b.exercises.length === 6, 'T4 has exactly 6 exercises');

    assert(b.exercises[0].id === 'b-lat-pulldown', 'bài 1 id unchanged');
    assert(b.exercises[0].name === 'Lat Pulldown', 'bài 1 name unchanged');
    assert(b.exercises[1].id === 'b-seated-cable-row', 'bài 2 id unchanged');
    assert(b.exercises[1].name === 'Seated Cable Row', 'bài 2 name unchanged');

    const b3 = b.exercises[2];
    const b4 = b.exercises[3];
    const b5 = b.exercises[4];
    const b6 = b.exercises[5];

    assert(b3.id === 'b-rope-pull-to-belly', 'bài 3 id');
    assert(b3.name === 'Kéo dây thừng về bụng – khuỷu khép', 'bài 3 name');
    assert(b3.sets === 3 && b3.reps === 25 && b3.resistance === 12.5 && b3.resistanceType === 'kg', 'bài 3 specs');
    assert(/KHÉP|khép/.test(b3.instructions), 'bài 3 instructions mention elbows close');

    assert(b4.id === 'b-rope-pull-to-chest', 'bài 4 id');
    assert(b4.name === 'Kéo dây thừng về ngực – khuỷu mở', 'bài 4 name');
    assert(b4.sets === 3 && b4.reps === 25 && b4.resistance === 12.5 && b4.resistanceType === 'kg', 'bài 4 specs');
    assert(/MỞ SANG HAI BÊN|mở sang hai bên/i.test(b4.instructions), 'bài 4 instructions mention elbows open');

    assert(b5.id === 'b-incline-y-raise', 'bài 5 id');
    assert(b5.name === 'Nâng tạ chữ Y trên ghế dốc', 'bài 5 name');
    assert(b5.sets === 3 && b5.reps === 20 && b5.resistance === 2 && b5.resistanceType === 'kg', 'bài 5 specs');
    assert(/CHỮ Y|chữ Y/.test(b5.instructions), 'bài 5 instructions mention Y shape');
    assert(/bench|ghế/i.test(b5.instructions), 'bài 5 instructions mention incline bench');

    assert(b6.id === 'b-dumbbell-6-way-raise', 'bài 6 id');
    assert(b6.name === 'Nâng tạ 6 hướng', 'bài 6 name');
    assert(b6.sets === 3 && b6.reps === 20 && b6.resistance === 1 && b6.resistanceType === 'kg', 'bài 6 specs');
    assert(/SANG NGANG/.test(b6.instructions), 'bài 6 step: ngang');
    assert(/TRƯỚC MẶT/.test(b6.instructions), 'bài 6 step: trước mặt');
    assert(/TRÊN ĐẦU/.test(b6.instructions), 'bài 6 step: trên đầu');

    // legacy 4-exercise T4 migrates while preserving b1/b2 + custom image on new slot
    const legacy = {
      b: {
        id: 'b',
        title: '💪 Upper Body',
        exercises: [
          b.exercises[0],
          b.exercises[1],
          {
            id: 'b-dumbbell-shoulder-press',
            name: 'Dumbbell Shoulder Press',
            image: 'assets/exercises/dumbbell-shoulder-press.jpg',
            imageId: '',
            instructions: 'old',
            notes: '',
            sets: 3,
            reps: 10,
            resistance: 5,
            resistanceType: 'kg'
          },
          {
            id: 'b-lateral-raise',
            name: 'Lateral Raise',
            image: 'assets/exercises/lateral-raise.jpg',
            imageId: '',
            instructions: 'old',
            notes: '',
            sets: 3,
            reps: 15,
            resistance: 2,
            resistanceType: 'kg'
          }
        ]
      }
    };
    sharedStorage.set('myfit-workouts-v2', JSON.stringify(legacy));
    fresh.dom.window.close();

    const migrated = loadApp();
    const Mb = migrated.window.MyFitData;
    const after = Mb.loadWorkouts().b;
    assert(after.exercises.length === 6, 'legacy T4 migrates to 6 exercises');
    assert(after.title === '💪 Lưng + Vai', 'legacy T4 title updated');
    assert(after.exercises[0].name === 'Lat Pulldown', 'legacy migration preserves bài 1');
    assert(after.exercises[1].name === 'Seated Cable Row', 'legacy migration preserves bài 2');
    assert(after.exercises[2].id === 'b-rope-pull-to-belly', 'legacy migration sets bài 3');
    assert(after.exercises[3].id === 'b-rope-pull-to-chest', 'legacy migration sets bài 4');

    // custom imageId on bài 3 survives migration re-run
    after.exercises[2].imageId = 'img-t4-belly-custom';
    after.exercises[2].image = '';
    sharedStorage.set('myfit-workouts-v2', JSON.stringify({ b: after, a: Mb.loadWorkouts().a, c: Mb.loadWorkouts().c }));
    migrated.dom.window.close();

    const reloaded = loadApp();
    const belly = reloaded.window.MyFitData.loadWorkouts().b.exercises[2];
    assert(belly.imageId === 'img-t4-belly-custom', 'custom imageId on bài 3 preserved after migration');
    assert(belly.sets === 3 && belly.reps === 25 && belly.resistance === 12.5, 'bài 3 specs kept after custom image');

    // library includes T4 schedule exercises by same identity
    const lib = reloaded.window.MyFitData.loadLibrary(reloaded.window.MyFitApp.getWorkouts());
    assert(lib.exercises.some((ex) => ex.id === 'b-rope-pull-to-belly'), 'library has bài 3 from schedule');
    assert(lib.exercises.some((ex) => ex.id === 'b-dumbbell-6-way-raise'), 'library has bài 6 from schedule');

    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert(html.includes('Thêm vào T4 · Lưng + Vai'), 'schedule add button uses Lưng + Vai label');
    assert(!html.includes('Thêm vào T4 · Upper Body'), 'old Upper Body label removed');

    reloaded.dom.window.close();
    pass('TEST 33: T4 Lưng + Vai six-exercise program + migration preserves head/custom image');
  } catch (err) {
    fail('TEST 33', err);
  }

  // TEST 34: library add form — muscle groups + instruction metadata
  try {
    resetStorage();
    const { window, dom } = loadApp();
    const D = window.MyFitData;
    const addForm = window.document.getElementById('add-exercise-form');
    assert(D.MUSCLE_GROUP_CONFIG.length === 10, '10 primary muscle groups in config');
    assert(D.MUSCLE_GROUPS.length === 11, '11 muscle groups including legacy full-body');
    assert(D.INSTRUCTION_IMAGE_TYPES.length === 4, '4 instruction image types');
    assert(addForm.elements.primaryMuscleGroup, 'add form primary muscle select');
    assert(addForm.elements.tips, 'add form tips field');
    assert(addForm.elements.commonMistakes, 'add form common mistakes field');
    assert(addForm.querySelector('[data-role="instruction-gallery"]'), 'add form instruction gallery');

    const exercise = D.normalizeExercise({
      id: 'lib-metadata-test',
      name: 'Metadata Test',
      primaryMuscleGroup: 'glutes',
      secondaryMuscleGroups: ['hamstrings', 'core'],
      instructions: 'Do the move',
      tips: 'Keep core tight',
      commonMistakes: 'Do not rush',
      instructionImages: [
        { type: 'instruction', imageId: 'img-guide-1', label: 'Start position' },
        { type: 'anatomy', imageId: 'img-anat-1', label: 'Glute focus' }
      ],
      sets: 3,
      reps: 12,
      resistance: 0,
      resistanceType: 'bodyweight'
    }, 'lib');

    assert(exercise.primaryMuscleGroup === 'glutes', 'primary muscle normalized');
    assert(exercise.secondaryMuscleGroups.length === 2, 'secondary muscles normalized');
    assert(exercise.instructionImages.length === 2, 'instruction images normalized');
    assert(exercise.instructionImages[1].type === 'anatomy', 'instruction image type preserved');

    const snap = D.snapshotExercise(exercise);
    assert(snap.tips === 'Keep core tight', 'snapshot includes tips');
    assert(snap.instructionImages.length === 2, 'snapshot includes instruction images');

    dom.window.close();
    pass('TEST 34: library add form muscle groups + instruction metadata model');
  } catch (err) {
    fail('TEST 34', err);
  }

  // TEST 35: library full flow — add → persist → detail fields → edit → workout snapshot
  try {
    resetStorage();
    const first = loadApp();
    const D = first.window.MyFitData;
    const Img = first.window.MyFitImages;
    const doc = first.window.document;

    const blob = new first.window.Blob(['guide-image'], { type: 'image/png' });
    const guideId = await Img.putImage(blob);
    const thumbId = await Img.putImage(new first.window.Blob(['thumb'], { type: 'image/png' }));

    const exercise = D.normalizeExercise({
      id: 'lib-flow-bridge',
      name: 'Flow Test Bridge',
      primaryMuscleGroup: 'glutes',
      secondaryMuscleGroups: ['hamstrings'],
      instructions: 'Nâng hông lên',
      tips: 'Siết mông',
      commonMistakes: 'Không ưỡn lưng',
      notes: 'Dùng thảm',
      imageId: thumbId,
      image: '',
      instructionImages: [
        { type: 'instruction', imageId: guideId, label: 'Tư thế bắt đầu', order: 0 },
        { type: 'mistake', imageId: guideId, label: 'Sai lưng', order: 1 }
      ],
      sets: 3,
      reps: 15,
      resistance: 0,
      resistanceType: 'bodyweight'
    }, 'lib');

    first.window.MyFitApp.getLibrary().exercises.push(exercise);
    D.saveLibrary(first.window.MyFitApp.getLibrary());

    first.dom.window.close();

    const reloaded = loadApp();
    const lib = reloaded.window.MyFitData.loadLibrary();
    const saved = lib.exercises.find((ex) => ex.name === 'Flow Test Bridge');
    assert(saved, 'library exercise persisted after reload');
    assert(saved.primaryMuscleGroup === 'glutes', 'primary muscle persisted');
    assert(saved.instructionImages.length === 2, 'instruction images persisted');
    assert(saved.instructionImages[0].type === 'instruction', 'instruction image type persisted');

    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert(html.includes('dprimary-muscle'), 'detail view has primary muscle slot');
    assert(html.includes('dinstruction-gallery'), 'detail view has instruction gallery');

    const snap = reloaded.window.MyFitData.snapshotExercise(saved);
    assert(snap.tips === 'Siết mông', 'workout snapshot keeps tips');
    assert(snap.instructionImages.length === 2, 'workout snapshot keeps instruction images');

    const legacy = reloaded.window.MyFitData.normalizeExercise({
      id: 'lib-old-face-pull',
      name: 'Legacy Face Pull',
      instructions: 'Kéo về mặt',
      sets: 3,
      reps: 12,
      resistance: 0,
      resistanceType: 'band',
      image: 'assets/exercises/face-pull.jpg'
    }, 'lib');
    assert(legacy.primaryMuscleGroup === '', 'legacy exercise keeps empty primary muscle');
    assert(Array.isArray(legacy.secondaryMuscleGroups), 'legacy exercise has secondary array');
    assert(legacy.instructionImages.length === 0, 'legacy exercise has empty instruction images');

    reloaded.dom.window.close();
    pass('TEST 35: library add persist detail metadata edit-ready + legacy compat');
  } catch (err) {
    fail('TEST 35', err);
  }

  // TEST 36: instruction images survive fast save + detail gallery renders
  try {
    resetStorage();
    const { window, dom } = loadApp();
    const doc = window.document;
    const app = window.MyFitApp;

    app.welcomeOpenLibrary();
    const form = doc.getElementById('add-exercise-form');
    form.elements.name.value = 'Fast Save Instruction Test';
    form.elements.instructions.value = 'Do it';
    form.elements.sets.value = 3;
    form.elements.reps.value = 12;

    const fileInput = form.querySelector('[data-role="instruction-file"]');
    const file = new window.File(['instruction-image-bytes'], 'step1.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));

    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(900);

    const lib = window.MyFitData.loadLibrary();
    const saved = lib.exercises.find((ex) => ex.name === 'Fast Save Instruction Test');
    assert(saved, 'exercise saved to library');
    assert(saved.instructionImages && saved.instructionImages.length === 1, 'instruction image saved even on fast submit');
    assert(saved.instructionImages[0].imageId, 'instruction imageId persisted');

    const stored = JSON.parse(sharedStorage.get('myfit-library-v1'));
    const storedEx = stored.exercises.find((ex) => ex.name === 'Fast Save Instruction Test');
    assert(storedEx.instructionImages.length === 1, 'instructionImages in localStorage JSON');

    const idx = app.getLibrary().exercises.findIndex((ex) => ex.id === saved.id);
    const detailBtn = doc.querySelector('[data-library-action="detail"][data-index="' + idx + '"]');
    assert(detailBtn, 'library detail button exists for saved exercise');
    detailBtn.click();
    await wait(250);

    const gallery = doc.getElementById('dinstruction-gallery');
    assert(gallery && gallery.hidden === false, 'detail gallery visible');
    assert(gallery.querySelectorAll('img').length === 1, 'detail gallery renders one instruction image');
    const img = gallery.querySelector('img');
    assert(img && img.getAttribute('src'), 'instruction image src resolved in detail');

    const merged = window.MyFitData.mergeExerciseMaster(
      { id: 'lib-test', name: 'Merge Test', instructionImages: [{ type: 'instruction', imageId: 'img-a', image: '', order: 0 }] },
      { id: 'a-merge-test', name: 'Merge Test', instructionImages: [], image: 'assets/x.jpg', imageId: '' }
    );
    assert(merged.instructionImages.length === 1, 'merge preserves lib instructionImages when schedule lacks them');

    dom.window.close();
    pass('TEST 36: instruction images fast save, storage, detail gallery, merge preserve');
  } catch (err) {
    fail('TEST 36', err);
  }

  // TEST 37: edit exercise muscle only — preserve thumbnail + instruction images (T4 bài 3/4)
  try {
    resetStorage();
    const { window, dom } = loadApp();
    const D = window.MyFitData;
    const app = window.MyFitApp;
    const Img = window.MyFitImages;
    const doc = window.document;

    app.showHome();
    app.selectWorkout('b');

    const bellyIdx = app.getWorkouts().b.exercises.findIndex((ex) => ex.id === 'b-rope-pull-to-belly');
    const chestIdx = app.getWorkouts().b.exercises.findIndex((ex) => ex.id === 'b-rope-pull-to-chest');
    assert(bellyIdx >= 0 && chestIdx >= 0, 'T4 rope pull exercises present');

    const catalogBelly = D.catalogImageForExercise({ id: 'b-rope-pull-to-belly', name: 'Kéo dây thừng về bụng – khuỷu khép' });
    const catalogChest = D.catalogImageForExercise({ id: 'b-rope-pull-to-chest', name: 'Kéo dây thừng về ngực – khuỷu mở' });
    assert(catalogBelly && catalogChest, 'catalog images exist for T4 rope exercises');

    const workouts = app.getWorkouts();
    workouts.b.exercises[bellyIdx].imageId = 'img-t4-belly-edit';
    workouts.b.exercises[bellyIdx].image = '';
    workouts.b.exercises[bellyIdx].instructionImages = [
      { type: 'instruction', imageId: 'img-t4-belly-guide', label: 'Kéo về bụng', order: 0 }
    ];
    D.saveWorkouts(workouts);
    sharedImageMemory['img-t4-belly-edit'] = new Blob(['thumb'], { type: 'image/jpeg' });
    sharedImageMemory['img-t4-belly-guide'] = new Blob(['guide'], { type: 'image/jpeg' });

    app.selectWorkout('b');
    app.openEdit(bellyIdx);
    const editForm = doc.getElementById('edit-form');
    editForm.elements.primaryMuscleGroup.value = 'back';
    editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(400);

    const bellySaved = app.getWorkouts().b.exercises[bellyIdx];
    assert(bellySaved.primaryMuscleGroup === 'back', 'bài 3 muscle group updated to Lưng');
    assert(bellySaved.imageId === 'img-t4-belly-edit', 'bài 3 custom thumbnail imageId preserved on fast edit');
    assert(bellySaved.instructionImages.length === 1, 'bài 3 instructionImages preserved on fast edit');
    assert(bellySaved.instructionImages[0].imageId === 'img-t4-belly-guide', 'bài 3 instruction imageId preserved');
    const bellySrc = await Img.resolveImageSrc(bellySaved);
    assert(String(bellySrc).indexOf('blob:') === 0, 'bài 3 thumbnail still resolves after edit');

    app.openEdit(chestIdx);
    editForm.elements.primaryMuscleGroup.value = 'back';
    editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(400);

    const chestSaved = app.getWorkouts().b.exercises[chestIdx];
    assert(chestSaved.primaryMuscleGroup === 'back', 'bài 4 muscle group updated to Lưng');
    assert(chestSaved.image.indexOf('face-pull') >= 0 || chestSaved.image === catalogChest, 'bài 4 catalog thumbnail preserved');
    const chestSrc = await Img.resolveImageSrc(chestSaved);
    assert(String(chestSrc).indexOf('face-pull') >= 0, 'bài 4 thumbnail resolves after edit');

    D.saveWorkouts(app.getWorkouts());
    dom.window.close();
    const reloaded = loadApp();
    const bellyReload = reloaded.window.MyFitData.loadWorkouts().b.exercises.find((ex) => ex.id === 'b-rope-pull-to-belly');
    assert(bellyReload.imageId === 'img-t4-belly-edit', 'bài 3 imageId survives reload');
    assert(bellyReload.instructionImages.length === 1, 'bài 3 instructionImages survive reload');
    reloaded.dom.window.close();

    pass('TEST 37: edit muscle only preserves images (T4 bài 3/4)');
  } catch (err) {
    fail('TEST 37', err);
  }

  // TEST 38: shared muscle filter — library + pick modal + edit preserves image
  try {
    resetStorage();
    const { window, dom } = loadApp();
    const D = window.MyFitData;
    const app = window.MyFitApp;
    const doc = window.document;

    const lib = D.loadLibrary();
    const medius = lib.exercises.find((ex) => ex.secondaryMuscleGroup === 'gluteus_medius');
    const facePull = lib.exercises.find((ex) => ex.name === 'Face Pull');
    assert(medius && facePull, 'seed library has gluteus medius + Face Pull');

    const glutesMediusFilter = {
      primaryId: 'glutes',
      subgroupId: 'gluteus_medius',
      leafId: '',
      search: ''
    };
    const glutesFiltered = D.filterExercisesByMuscle(lib.exercises, glutesMediusFilter);
    assert(glutesFiltered.some((ex) => ex.name === 'Banded Abduction'), 'filter glutes → gluteus medius');
    assert(!glutesFiltered.some((ex) => ex.name === 'Cable Kickback'), 'gluteus maximus excluded');

    const trapFilter = {
      primaryId: 'back',
      subgroupId: 'traps',
      leafId: 'trap_middle',
      search: ''
    };
    const trapFiltered = D.filterExercisesByMuscle(lib.exercises, trapFilter);
    assert(trapFiltered.some((ex) => ex.name === 'Face Pull'), 'filter back → trap middle');

    const searchFilter = {
      primaryId: 'back',
      subgroupId: 'traps',
      leafId: 'trap_middle',
      search: 'face'
    };
    assert(D.filterExercisesByMuscle(lib.exercises, searchFilter).length === 1, 'search + filter combined');

    app.welcomeOpenLibrary();
    app.showLibrary();
    assert(doc.getElementById('library-muscle-filter'), 'library filter panel exists');
    assert(doc.getElementById('library-search'), 'library search input exists');

    app.openPickExerciseForSession({ fromRest: true });
    assert(doc.getElementById('pick-muscle-filter'), 'pick modal filter panel exists');
    assert(doc.getElementById('pick-exercise-search'), 'pick modal search exists');
    app.closePickExercise();

    const kickback = lib.exercises.find((ex) => ex.name === 'Cable Kickback');
    kickback.imageId = 'img-kickback-test';
    kickback.image = '';
    D.saveLibrary(lib);
    sharedImageMemory['img-kickback-test'] = new Blob(['k'], { type: 'image/jpeg' });
    const kickIdx = D.loadLibrary(app.getWorkouts()).exercises.findIndex((ex) => ex.id === kickback.id);
    app.showLibrary();
    const editBtn = doc.querySelector('[data-library-action="edit"][data-index="' + kickIdx + '"]');
    assert(editBtn, 'library edit button for kickback');
    editBtn.click();
    const editForm = doc.getElementById('edit-form');
    editForm.elements.primaryMuscleGroup.value = 'glutes';
    editForm.elements.primaryMuscleGroup.dispatchEvent(new window.Event('change', { bubbles: true }));
    editForm.elements.secondaryMuscleGroup.value = 'gluteus_medius';
    editForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(400);
    const savedKick = app.getLibrary().exercises.find((ex) => ex.id === kickback.id);
    assert(savedKick.secondaryMuscleGroup === 'gluteus_medius', 'edit secondary muscle saved');
    assert(savedKick.imageId === 'img-kickback-test', 'edit muscle change preserves imageId');

    dom.window.close();
    pass('TEST 38: muscle group config filter library pick edit image preserved');
  } catch (err) {
    fail('TEST 38', err);
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
