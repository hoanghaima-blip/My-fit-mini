(function () {
  'use strict';

  var D = window.MyFitData;
  var workouts = D.loadWorkouts();
  var currentWorkoutId = D.loadLastDay() || 'a';
  var selectedExerciseIndex = 0;
  var activeSession = D.loadActiveSession();
  var restTimerId = null;
  var resumePromptShown = false;

  var els = {
    title: document.getElementById('hero-title'),
    meta: document.getElementById('hero-meta'),
    list: document.getElementById('exercise-list'),
    week: document.getElementById('week-calendar'),
    resumeBanner: document.getElementById('resume-banner'),
    detailOverlay: document.getElementById('detail-overlay'),
    dprog: document.getElementById('dprog'),
    dname: document.getElementById('dname'),
    dmeta: document.getElementById('dmeta'),
    dnote: document.getElementById('dnote'),
    dimage: document.getElementById('dimage'),
    dinstructions: document.getElementById('dinstructions'),
    workoutOverlay: document.getElementById('workout-overlay'),
    wprog: document.getElementById('wprog'),
    wname: document.getElementById('wname'),
    wmeta: document.getElementById('wmeta'),
    wset: document.getElementById('wset'),
    wimage: document.getElementById('wimage'),
    wsetDisplay: document.getElementById('wset-display'),
    wrepsDisplay: document.getElementById('wreps-display'),
    restOverlay: document.getElementById('rest-overlay'),
    restLabel: document.getElementById('rest-label'),
    restTimer: document.getElementById('rest-timer'),
    completionOverlay: document.getElementById('completion-overlay'),
    completionStats: document.getElementById('completion-stats'),
    editOverlay: document.getElementById('edit-overlay'),
    replaceOverlay: document.getElementById('replace-overlay'),
    editForm: document.getElementById('edit-form'),
    replaceForm: document.getElementById('replace-form')
  };

  function getWorkout(workoutId) {
    return workouts[workoutId];
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hideOverlay(el) {
    if (el) el.style.display = 'none';
  }

  function showOverlay(el, mode) {
    if (!el) return;
    el.style.display = mode || 'flex';
  }

  function persistWorkouts() {
    D.saveWorkouts(workouts);
  }

  function persistSession() {
    D.saveActiveSession(activeSession);
  }

  function getCurrentExercise() {
    if (!activeSession) return null;
    return activeSession.exercises[activeSession.currentExerciseIndex] || null;
  }

  function renderHero() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    var estimated = D.estimateWorkoutSeconds(workout);
    els.title.textContent = workout.title;
    els.meta.textContent = workout.exercises.length + ' bài • khoảng ' + D.formatDuration(estimated);
    D.saveLastDay(currentWorkoutId);
  }

  function renderExerciseImage(image, className) {
    if (image) {
      return '<img class="' + className + '" src="' + escapeHtml(image) + '" alt="">';
    }
    return '<div class="' + className + ' placeholder">🏋️</div>';
  }

  function renderList() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    els.list.innerHTML = workout.exercises.map(function (exercise, index) {
      return (
        '<div class="card">' +
          '<div class="card-top">' +
            renderExerciseImage(exercise.image, 'card-image') +
            '<div class="card-body">' +
              '<div class="name">' + (index + 1) + '. ' + escapeHtml(exercise.name) + '</div>' +
              '<div class="meta">' + escapeHtml(D.formatExerciseMeta(exercise)) + '</div>' +
              '<span class="badge" data-action="detail" data-index="' + index + '">Xem hướng dẫn</span>' +
              (exercise.instructions ? '<div class="note">' + escapeHtml(exercise.instructions) + '</div>' : '') +
              (exercise.notes ? '<div class="note">' + escapeHtml(exercise.notes) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button type="button" data-action="edit" data-index="' + index + '">Sửa</button>' +
            '<button type="button" data-action="replace" data-index="' + index + '">Thay bài</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderWeek() {
    var todayIndex = D.getTodayWeekIndex();
    els.week.innerHTML = D.WEEK_DAYS.map(function (day, index) {
      var classes = ['day'];
      if (index === todayIndex) classes.push('today');
      if (day.workoutId) classes.push('clickable');
      return (
        '<div class="' + classes.join(' ') + '" data-day-key="' + day.key + '" data-workout-id="' + (day.workoutId || '') + '">' +
          day.label + '<span>' + day.emoji + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function renderTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.workoutId === currentWorkoutId);
    });
  }

  function renderAll() {
    renderHero();
    renderList();
    renderWeek();
    renderTabs();
  }

  function selectWorkout(workoutId) {
    if (!getWorkout(workoutId)) return;
    currentWorkoutId = workoutId;
    D.saveLastDay(workoutId);
    renderAll();
  }

  function openDetail(index) {
    selectedExerciseIndex = index;
    var exercise = getWorkout(currentWorkoutId).exercises[index];
    els.dprog.textContent = 'Bài ' + (index + 1) + '/' + getWorkout(currentWorkoutId).exercises.length;
    els.dname.textContent = exercise.name;
    els.dmeta.textContent = D.formatExerciseMeta(exercise);
    els.dnote.textContent = exercise.notes || '';
    els.dinstructions.textContent = exercise.instructions || '';
    if (exercise.image) {
      els.dimage.src = exercise.image;
      els.dimage.style.display = 'block';
    } else {
      els.dimage.style.display = 'none';
    }
    showOverlay(els.detailOverlay);
  }

  function closeDetail() {
    hideOverlay(els.detailOverlay);
  }

  function fillExerciseForm(form, exercise) {
    form.name.value = exercise.name;
    form.instructions.value = exercise.instructions || '';
    form.notes.value = exercise.notes || '';
    form.image.value = exercise.image || '';
    form.sets.value = exercise.sets;
    form.reps.value = exercise.reps;
    form.resistance.value = exercise.resistance;
    form.resistanceType.value = exercise.resistanceType;
  }

  function readExerciseForm(form, existingId, workoutId) {
    return {
      id: existingId || D.makeExerciseId(workoutId, form.name.value.trim()),
      name: form.name.value,
      image: form.image.value.trim(),
      instructions: form.instructions.value,
      notes: form.notes.value,
      sets: Math.max(1, parseInt(form.sets.value, 10) || 1),
      reps: Math.max(1, parseInt(form.reps.value, 10) || 1),
      resistance: Math.max(0, parseFloat(form.resistance.value) || 0),
      resistanceType: form.resistanceType.value
    };
  }

  function openEdit(index) {
    selectedExerciseIndex = index;
    fillExerciseForm(els.editForm, getWorkout(currentWorkoutId).exercises[index]);
    showOverlay(els.editOverlay);
  }

  function closeEdit() {
    hideOverlay(els.editOverlay);
  }

  function saveEdit(event) {
    event.preventDefault();
    var workout = getWorkout(currentWorkoutId);
    var current = workout.exercises[selectedExerciseIndex];
    workout.exercises[selectedExerciseIndex] = readExerciseForm(els.editForm, current.id, currentWorkoutId);
    persistWorkouts();
    closeEdit();
    renderAll();
  }

  function openReplace(index) {
    selectedExerciseIndex = index;
    els.replaceForm.reset();
    els.replaceForm.resistanceType.value = 'kg';
    els.replaceForm.sets.value = 3;
    els.replaceForm.reps.value = 10;
    showOverlay(els.replaceOverlay);
  }

  function closeReplace() {
    hideOverlay(els.replaceOverlay);
  }

  function saveReplace(event) {
    event.preventDefault();
    var workout = getWorkout(currentWorkoutId);
    var replacement = readExerciseForm(els.replaceForm, null, currentWorkoutId);
    workout.exercises[selectedExerciseIndex] = replacement;
    persistWorkouts();
    closeReplace();
    renderAll();
  }

  function clearRestTimer() {
    if (restTimerId) {
      clearInterval(restTimerId);
      restTimerId = null;
    }
  }

  function updateRestDisplay(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    els.restTimer.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function beginRest(kind, seconds) {
    activeSession.phase = kind === 'set' ? 'rest-set' : 'rest-exercise';
    activeSession.restKind = kind;
    activeSession.restEndTime = new Date(Date.now() + seconds * 1000).toISOString();
    activeSession.restRemaining = seconds;
    persistSession();
    hideOverlay(els.workoutOverlay);
    els.restLabel.textContent = kind === 'set' ? 'Nghỉ giữa SET' : 'Nghỉ giữa BÀI TẬP';
    updateRestDisplay(seconds);
    showOverlay(els.restOverlay, 'flex');
    clearRestTimer();
    restTimerId = setInterval(tickRest, 1000);
  }

  function finishRestAdvance() {
    clearRestTimer();
    hideOverlay(els.restOverlay);
    if (!activeSession) return;
    activeSession.restEndTime = null;
    activeSession.restRemaining = 0;
    activeSession.restKind = null;
    if (activeSession.phase === 'rest-set') {
      activeSession.phase = 'exercise';
      activeSession.currentSet += 1;
      persistSession();
      showWorkoutView();
      return;
    }
    if (activeSession.phase === 'rest-exercise') {
      if (activeSession.currentExerciseIndex >= activeSession.exercises.length - 1) {
        finishWorkout();
        return;
      }
      activeSession.currentExerciseIndex += 1;
      activeSession.currentSet = 1;
      activeSession.phase = 'exercise';
      persistSession();
      showWorkoutView();
    }
  }

  function tickRest() {
    if (!activeSession || !activeSession.restEndTime) return;
    var remaining = Math.max(0, Math.ceil((new Date(activeSession.restEndTime).getTime() - Date.now()) / 1000));
    activeSession.restRemaining = remaining;
    updateRestDisplay(remaining);
    persistSession();
    if (remaining <= 0) finishRestAdvance();
  }

  function skipRest() {
    if (!activeSession) return;
    activeSession.restEndTime = new Date().toISOString();
    tickRest();
  }

  function addRestSeconds() {
    if (!activeSession || !activeSession.restEndTime) return;
    var end = new Date(activeSession.restEndTime).getTime() + 15000;
    activeSession.restEndTime = new Date(end).toISOString();
    tickRest();
  }

  function resumeRestIfNeeded() {
    if (!activeSession) return;
    if (activeSession.phase === 'rest-set' || activeSession.phase === 'rest-exercise') {
      var remaining = Math.max(0, Math.ceil((new Date(activeSession.restEndTime).getTime() - Date.now()) / 1000));
      if (remaining <= 0) {
        finishRestAdvance();
      } else {
        beginRest(activeSession.restKind, remaining);
      }
      return true;
    }
    return false;
  }

  function showWorkoutView() {
    var current = getCurrentExercise();
    if (!current) return;
    var snap = current.snapshot;
    els.wprog.textContent = 'Bài ' + (activeSession.currentExerciseIndex + 1) + '/' + activeSession.exercises.length;
    els.wname.textContent = snap.name;
    els.wmeta.textContent = D.formatExerciseMeta(snap);
    els.wset.textContent = [snap.instructions, snap.notes].filter(Boolean).join('\n\n');
    els.wsetDisplay.textContent = 'SET ' + activeSession.currentSet + ' / ' + snap.sets;
    els.wrepsDisplay.textContent = snap.reps + ' REPS';
    if (snap.image) {
      els.wimage.src = snap.image;
      els.wimage.style.display = 'block';
    } else {
      els.wimage.style.display = 'none';
    }
    hideOverlay(els.restOverlay);
    hideOverlay(els.completionOverlay);
    showOverlay(els.workoutOverlay, 'flex');
    persistSession();
  }

  function startWorkout(fromExerciseIndex) {
    if (activeSession && !resumePromptShown) return;
    var workout = getWorkout(currentWorkoutId);
    activeSession = D.createWorkoutSession(workout);
    if (typeof fromExerciseIndex === 'number') {
      activeSession.currentExerciseIndex = fromExerciseIndex;
    }
    activeSession.startTime = new Date().toISOString();
    persistSession();
    showWorkoutView();
  }

  function startSelectedWorkout() {
    closeDetail();
    startWorkout(selectedExerciseIndex);
  }

  function completeSet() {
    var current = getCurrentExercise();
    if (!current || !activeSession) return;
    current.actualSetsCompleted += 1;
    current.actualReps = current.snapshot.reps;
    current.actualResistance = current.snapshot.resistance;
    current.completionStatus = 'in-progress';
    var plannedSets = current.snapshot.sets;
    if (activeSession.currentSet < plannedSets) {
      persistSession();
      beginRest('set', D.REST_SET_SECONDS);
      return;
    }
    completeExercise(false);
  }

  function completeExercise(skipSetRest) {
    var current = getCurrentExercise();
    if (!current || !activeSession) return;
    current.completionStatus = 'completed';
    persistSession();
    if (skipSetRest !== false) {
      clearRestTimer();
      hideOverlay(els.restOverlay);
    }
    if (activeSession.currentExerciseIndex >= activeSession.exercises.length - 1) {
      finishWorkout();
      return;
    }
    beginRest('exercise', D.REST_EXERCISE_SECONDS);
  }

  function finishWorkout() {
    if (!activeSession) return;
    clearRestTimer();
    activeSession.endTime = new Date().toISOString();
    activeSession.phase = 'complete';
    activeSession.actualDuration = Math.max(
      0,
      Math.round((new Date(activeSession.endTime).getTime() - new Date(activeSession.startTime).getTime()) / 1000)
    );
    var historyEntry = D.finalizeHistoryEntry(activeSession);
    var history = D.loadHistory();
    history.unshift(historyEntry);
    D.saveHistory(history);

    var completedExercises = activeSession.exercises.filter(function (item) {
      return item.completionStatus === 'completed';
    }).length;
    var totalSets = activeSession.exercises.reduce(function (sum, item) {
      return sum + item.actualSetsCompleted;
    }, 0);

    els.completionStats.innerHTML =
      '<div class="stat-card"><div class="stat-label">Thời gian dự kiến</div><div class="stat-value">' + escapeHtml(D.formatClockDuration(activeSession.estimatedDuration)) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Thời gian thực tế</div><div class="stat-value">' + escapeHtml(D.formatClockDuration(activeSession.actualDuration)) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Bài đã hoàn thành</div><div class="stat-value">' + completedExercises + '/' + activeSession.exercises.length + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Tổng số set thực tế</div><div class="stat-value">' + totalSets + '</div></div>';

    hideOverlay(els.workoutOverlay);
    hideOverlay(els.restOverlay);
    showOverlay(els.completionOverlay, 'flex');
    activeSession = null;
    D.saveActiveSession(null);
  }

  function closeWorkout() {
    if (activeSession) persistSession();
    clearRestTimer();
    hideOverlay(els.workoutOverlay);
    hideOverlay(els.restOverlay);
  }

  function closeCompletion() {
    hideOverlay(els.completionOverlay);
    renderAll();
  }

  function showResumeBanner() {
    if (!activeSession || resumePromptShown) return;
    resumePromptShown = true;
    els.resumeBanner.style.display = 'block';
  }

  function continueWorkout() {
    els.resumeBanner.style.display = 'none';
    if (!activeSession) return;
    if (activeSession.phase === 'complete') {
      activeSession = null;
      D.saveActiveSession(null);
      return;
    }
    if (resumeRestIfNeeded()) return;
    showWorkoutView();
  }

  function discardWorkout() {
    els.resumeBanner.style.display = 'none';
    activeSession = null;
    D.saveActiveSession(null);
    clearRestTimer();
    hideOverlay(els.workoutOverlay);
    hideOverlay(els.restOverlay);
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        selectWorkout(tab.dataset.workoutId);
      });
    });

    document.getElementById('start-workout-btn').addEventListener('click', function () {
      resumePromptShown = true;
      startWorkout(0);
    });

    els.list.addEventListener('click', function (event) {
      var target = event.target.closest('[data-action]');
      if (!target) return;
      var index = parseInt(target.dataset.index, 10);
      if (target.dataset.action === 'detail') openDetail(index);
      if (target.dataset.action === 'edit') openEdit(index);
      if (target.dataset.action === 'replace') openReplace(index);
    });

    els.week.addEventListener('click', function (event) {
      var dayEl = event.target.closest('.day.clickable');
      if (!dayEl) return;
      var workoutId = dayEl.dataset.workoutId;
      if (workoutId) selectWorkout(workoutId);
    });

    document.getElementById('detail-close-btn').addEventListener('click', closeDetail);
    document.getElementById('detail-start-btn').addEventListener('click', startSelectedWorkout);
    document.getElementById('edit-close-btn').addEventListener('click', closeEdit);
    document.getElementById('replace-close-btn').addEventListener('click', closeReplace);
    els.editForm.addEventListener('submit', saveEdit);
    els.replaceForm.addEventListener('submit', saveReplace);
    document.getElementById('complete-set-btn').addEventListener('click', completeSet);
    document.getElementById('complete-exercise-btn').addEventListener('click', function () {
      completeExercise(true);
    });
    document.getElementById('workout-close-btn').addEventListener('click', closeWorkout);
    document.getElementById('rest-skip-btn').addEventListener('click', skipRest);
    document.getElementById('rest-add-btn').addEventListener('click', addRestSeconds);
    document.getElementById('completion-home-btn').addEventListener('click', closeCompletion);
    document.getElementById('resume-continue-btn').addEventListener('click', continueWorkout);
    document.getElementById('resume-discard-btn').addEventListener('click', discardWorkout);
  }

  function init() {
    if (!getWorkout(currentWorkoutId)) currentWorkoutId = 'a';
    bindEvents();
    renderAll();
    if (activeSession && activeSession.phase !== 'complete') showResumeBanner();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  }

  window.MyFitApp = {
    getWorkouts: function () { return workouts; },
    getActiveSession: function () { return activeSession; },
    setActiveSession: function (session) { activeSession = session; persistSession(); },
    selectWorkout: selectWorkout,
    startWorkout: startWorkout,
    completeSet: completeSet,
    completeExercise: completeExercise,
    finishWorkout: finishWorkout,
    saveWorkouts: persistWorkouts,
    renderAll: renderAll,
    beginRest: beginRest,
    tickRest: tickRest,
    finishRestAdvance: finishRestAdvance,
    showWorkoutView: showWorkoutView,
    continueWorkout: continueWorkout
  };

  init();
})();
