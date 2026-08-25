/**
 * Automated flow tests for My Fit Mini core logic.
 * Run: node tests/flow-tests.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const sharedStorage = new Map();

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
  virtualConsole.on('error', () => {});
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    resources: 'usable',
    virtualConsole
  });
  const { window } = dom;
  Object.defineProperty(window, 'localStorage', { value: createStorage() });
  const doc = window.document;
  doc.body.innerHTML = readFileSync(join(root, 'index.html'), 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  window.eval(readFileSync(join(root, 'data.js'), 'utf8'));
  window.eval(readFileSync(join(root, 'app.js'), 'utf8'));
  return { window, dom };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resetStorage() {
  sharedStorage.clear();
}

function makeMiniWorkout(window) {
  const D = window.MyFitData;
  return {
    id: 'test',
    title: 'Test Workout',
    exercises: [
      {
        id: 'test-ex-1',
        name: 'Exercise One',
        image: '',
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
  const workouts = D.loadWorkouts();
  workouts.test = makeMiniWorkout(window);
  D.saveWorkouts(workouts);
  window.MyFitApp.selectWorkout('test');
}

async function run() {
  const results = [];
  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, err) => results.push({ name, ok: false, err: String(err) });

  // TEST 1: 3 sets complete -> 60s set rest, then 90s exercise rest
  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const D = window.MyFitData;
    const app = window.MyFitApp;
    app.startWorkout(0);
    let session = app.getActiveSession();
    assert(session.phase === 'exercise', 'starts in exercise phase');
    assert(session.exercises[0].snapshot.sets === 3, 'uses exercise.sets not hardcoded');
    app.completeSet();
    session = app.getActiveSession();
    assert(session.phase === 'rest-set', 'set rest after set 1');
    assert(session.restRemaining >= 59 && session.restRemaining <= 60, 'set rest is 60s');
    app.finishRestAdvance();
    app.completeSet();
    session = app.getActiveSession();
    assert(session.phase === 'rest-set', 'second set rest');
    app.finishRestAdvance();
    app.completeSet();
    session = app.getActiveSession();
    assert(session.phase === 'rest-exercise', 'exercise rest after finishing 3/3 sets');
    assert(session.restRemaining >= 89 && session.restRemaining <= 90, 'exercise rest is 90s');
    pass('TEST 1: 3/3 sets -> 60s set rest, 90s exercise rest');
  } catch (err) {
    fail('TEST 1', err);
  }

  // TEST 2: complete 2/3 sets then complete exercise -> no extra 60s, 90s exercise rest
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

  // TEST 3: edit exercise persists after reload
  try {
    const first = loadApp();
    resetStorage();
    installMiniWorkout(first.window);
    const D = first.window.MyFitData;
    const workouts = D.loadWorkouts();
    workouts.test.exercises[0].name = 'Edited Exercise';
    workouts.test.exercises[0].sets = 4;
    D.saveWorkouts(workouts);
    first.dom.window.close();
    const reloaded = loadApp();
    const saved = reloaded.window.MyFitData.loadWorkouts();
    assert(saved.test.exercises[0].name === 'Edited Exercise', 'name persisted');
    assert(saved.test.exercises[0].sets === 4, 'sets persisted');
    pass('TEST 3: edit exercise persists after reload');
    reloaded.dom.window.close();
  } catch (err) {
    fail('TEST 3', err);
  }

  // TEST 4: replace exercise updates current workout but not history snapshot
  try {
    const { window } = loadApp();
    resetStorage();
    installMiniWorkout(window);
    const D = window.MyFitData;
    const app = window.MyFitApp;
    app.startWorkout(0);
    const oldSnapshotName = app.getActiveSession().exercises[0].snapshot.name;
    app.finishWorkout();
    const workouts = D.loadWorkouts();
    workouts.test.exercises[0] = {
      id: 'test-ex-new',
      name: 'Brand New Exercise',
      image: '',
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
    assert(D.loadWorkouts().test.exercises[0].name === 'Brand New Exercise', 'current workout updated');
    pass('TEST 4: replace exercise keeps history snapshot');
    window.close?.();
  } catch (err) {
    fail('TEST 4', err);
  }

  // TEST 5: actual duration saved
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

  // TEST 6: estimated duration unchanged by actual duration
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

  // TEST 7: reload mid-workout can resume
  try {
    const first = loadApp();
    resetStorage(first.window);
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

  console.log('\nMy Fit Mini Test Results');
  console.log('========================');
  results.forEach((result) => {
    if (result.ok) console.log('PASS', result.name);
    else console.log('FAIL', result.name, '-', result.err);
  });
  const failed = results.filter((r) => !r.ok).length;
  console.log('\nTotal:', results.length, 'Passed:', results.length - failed, 'Failed:', failed);
  if (failed > 0) process.exit(1);
}

run();
