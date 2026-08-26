(function () {
  'use strict';

  var D = window.MyFitData;
  var Img = window.MyFitImages;
  var workouts = D.loadWorkouts();
  var currentWorkoutId = D.loadLastDay() || 'a';
  var selectedExerciseIndex = 0;
  var activeSession = D.loadActiveSession();
  var restTimerId = null;
  var resumePromptShown = false;
  var formImageState = {
    edit: { pendingFile: null, clearImage: false, existingImageId: '', existingImage: '', previewUrl: '' },
    replace: { pendingFile: null, clearImage: false, existingImageId: '', existingImage: '', previewUrl: '' }
  };

  var els = {
    title: document.getElementById('hero-title'),
    meta: document.getElementById('hero-meta'),
    list: document.getElementById('exercise-list'),
    historyList: document.getElementById('history-list'),
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
    replaceForm: document.getElementById('replace-form'),
    historyDetailOverlay: document.getElementById('history-detail-overlay'),
    historyDetailContent: document.getElementById('history-detail-content')
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

  function setImageElement(imgEl, src) {
    if (!imgEl) return;
    if (src) {
      imgEl.src = src;
      imgEl.style.display = 'block';
    } else {
      imgEl.removeAttribute('src');
      imgEl.style.display = 'none';
    }
  }

  function applyImageToElement(target, imageRef) {
    return Img.resolveImageSrc(imageRef).then(function (src) {
      setImageElement(target, src);
      return src;
    });
  }

  function renderHero() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    var estimated = D.estimateWorkoutSeconds(workout);
    els.title.textContent = workout.title;
    els.meta.textContent = workout.exercises.length + ' bài • khoảng ' + D.formatDuration(estimated);
    D.saveLastDay(currentWorkoutId);
  }

  function placeholderImageHtml(className) {
    return '<div class="' + className + ' placeholder" data-image-slot>🏋️</div>';
  }

  function renderList() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    els.list.innerHTML = workout.exercises.map(function (exercise, index) {
      return (
        '<div class="card">' +
          '<div class="card-top">' +
            placeholderImageHtml('card-image') +
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

    var cards = els.list.querySelectorAll('.card');
    workout.exercises.forEach(function (exercise, index) {
      var slot = cards[index] && cards[index].querySelector('[data-image-slot]');
      if (!slot) return;
      Img.resolveImageSrc(exercise).then(function (src) {
        if (!src || !slot.parentNode) return;
        var img = document.createElement('img');
        img.className = 'card-image';
        img.alt = '';
        img.src = src;
        slot.replaceWith(img);
      });
    });
  }

  function renderHistory() {
    var history = D.loadHistory();
    if (!history.length) {
      els.historyList.innerHTML = '<div class="history-empty">Chưa có buổi tập nào được lưu. Hoàn thành một workout để xem lịch sử tại đây.</div>';
      return;
    }
    els.historyList.innerHTML = history.map(function (entry, index) {
      var summary = D.summarizeHistoryEntry(entry);
      return (
        '<div class="card history-card" data-history-index="' + index + '">' +
          '<div class="name">' + escapeHtml(entry.workoutName) + '</div>' +
          '<div class="meta">' + escapeHtml(D.formatDateVi(entry.date)) + ' · ' +
            escapeHtml(D.formatTime(entry.startTime)) + ' – ' + escapeHtml(D.formatTime(entry.endTime)) +
          '</div>' +
          '<div class="history-row"><span>Dự kiến</span><strong>' + escapeHtml(D.formatClockDuration(entry.estimatedDuration)) + '</strong></div>' +
          '<div class="history-row"><span>Thực tế</span><strong>' + escapeHtml(D.formatClockDuration(entry.actualDuration)) + '</strong></div>' +
          '<div class="history-row"><span>Bài tập</span><strong>' + summary.exerciseCount + '</strong></div>' +
          '<div class="history-row"><span>Sets (planned / actual)</span><strong>' + summary.plannedSets + ' / ' + summary.actualSets + '</strong></div>' +
          '<span class="badge">Xem chi tiết</span>' +
        '</div>'
      );
    }).join('');
  }

  function openHistoryDetail(index) {
    var history = D.loadHistory();
    var entry = history[index];
    if (!entry) return;
    var summary = D.summarizeHistoryEntry(entry);
    var html =
      '<div class="progress">Chi tiết buổi tập</div>' +
      '<h2>' + escapeHtml(entry.workoutName) + '</h2>' +
      '<div class="meta">' + escapeHtml(D.formatDateVi(entry.date)) + '</div>' +
      '<div class="history-row"><span>Bắt đầu</span><strong>' + escapeHtml(D.formatTime(entry.startTime)) + '</strong></div>' +
      '<div class="history-row"><span>Kết thúc</span><strong>' + escapeHtml(D.formatTime(entry.endTime)) + '</strong></div>' +
      '<div class="history-row"><span>Dự kiến</span><strong>' + escapeHtml(D.formatClockDuration(entry.estimatedDuration)) + '</strong></div>' +
      '<div class="history-row"><span>Thực tế</span><strong>' + escapeHtml(D.formatClockDuration(entry.actualDuration)) + '</strong></div>' +
      '<div class="history-row"><span>Bài tập</span><strong>' + summary.exerciseCount + '</strong></div>' +
      '<div class="history-row"><span>Sets planned / actual</span><strong>' + summary.plannedSets + ' / ' + summary.actualSets + '</strong></div>' +
      '<div class="history-detail-list">';

    entry.exercises.forEach(function (item, i) {
      var snap = item.snapshot || {};
      var status = item.completionStatus || 'pending';
      var resistance = {
        resistance: item.actualResistance != null ? item.actualResistance : snap.resistance,
        resistanceType: item.plannedResistanceType || snap.resistanceType || 'kg'
      };
      html +=
        '<div class="history-exercise" data-history-ex="' + i + '">' +
          placeholderImageHtml('card-image') +
          '<div class="name">' + (i + 1) + '. ' + escapeHtml(snap.name || 'Bài tập') + '</div>' +
          '<div class="meta">Planned: ' + (item.plannedSets || snap.sets || 0) + ' × ' + (item.plannedReps || snap.reps || 0) + '</div>' +
          '<div class="meta">Actual sets: ' + (item.actualSetsCompleted || 0) + '</div>' +
          '<div class="meta">Resistance: ' + escapeHtml(D.formatResistance(resistance)) + '</div>' +
          '<span class="status-pill ' + escapeHtml(status) + '">' + escapeHtml(D.completionStatusLabel(status)) + '</span>' +
        '</div>';
    });
    html += '</div>';
    els.historyDetailContent.innerHTML = html;
    showOverlay(els.historyDetailOverlay);

    entry.exercises.forEach(function (item, i) {
      var block = els.historyDetailContent.querySelector('[data-history-ex="' + i + '"]');
      var slot = block && block.querySelector('[data-image-slot]');
      if (!slot) return;
      Img.resolveImageSrc(item.snapshot || {}).then(function (src) {
        if (!src || !slot.parentNode) return;
        var img = document.createElement('img');
        img.className = 'card-image';
        img.alt = '';
        img.src = src;
        slot.replaceWith(img);
      });
    });
  }

  function closeHistoryDetail() {
    hideOverlay(els.historyDetailOverlay);
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
    renderHistory();
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
    applyImageToElement(els.dimage, exercise);
    showOverlay(els.detailOverlay);
  }

  function closeDetail() {
    hideOverlay(els.detailOverlay);
  }

  function getFormMode(form) {
    return form === els.editForm ? 'edit' : 'replace';
  }

  function getFormPreview(form) {
    return form.querySelector('[data-role="preview"]');
  }

  function resetFormImageState(mode) {
    var state = formImageState[mode];
    if (state.previewUrl && state.previewUrl.indexOf('blob:') === 0) {
      URL.revokeObjectURL(state.previewUrl);
    }
    formImageState[mode] = {
      pendingFile: null,
      clearImage: false,
      existingImageId: '',
      existingImage: '',
      previewUrl: ''
    };
  }

  function showFormPreview(form, src) {
    var preview = getFormPreview(form);
    if (!preview) return;
    if (src) {
      preview.src = src;
      preview.style.display = 'block';
    } else {
      preview.removeAttribute('src');
      preview.style.display = 'none';
    }
  }

  function bindImagePicker(form) {
    var pickBtn = form.querySelector('[data-role="pick"]');
    var clearBtn = form.querySelector('[data-role="clear"]');
    var fileInput = form.elements.imageFile;
    var urlInput = form.elements.image;
    if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', function () {
        fileInput.click();
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var mode = getFormMode(form);
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        formImageState[mode].pendingFile = file;
        formImageState[mode].clearImage = false;
        urlInput.value = '';
        if (formImageState[mode].previewUrl && formImageState[mode].previewUrl.indexOf('blob:') === 0) {
          URL.revokeObjectURL(formImageState[mode].previewUrl);
        }
        var previewUrl = URL.createObjectURL(file);
        formImageState[mode].previewUrl = previewUrl;
        showFormPreview(form, previewUrl);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var mode = getFormMode(form);
        formImageState[mode].pendingFile = null;
        formImageState[mode].clearImage = true;
        formImageState[mode].existingImageId = '';
        formImageState[mode].existingImage = '';
        urlInput.value = '';
        if (fileInput) fileInput.value = '';
        showFormPreview(form, '');
      });
    }
    if (urlInput) {
      urlInput.addEventListener('input', function () {
        var mode = getFormMode(form);
        if (!urlInput.value.trim()) return;
        formImageState[mode].pendingFile = null;
        formImageState[mode].clearImage = false;
        formImageState[mode].existingImageId = '';
        showFormPreview(form, urlInput.value.trim());
      });
    }
  }

  function readExerciseForm(form, existingId, workoutId) {
    var mode = getFormMode(form);
    var state = formImageState[mode];
    var fields = form.elements;
    var base = {
      id: existingId || D.makeExerciseId(workoutId, fields.name.value.trim()),
      name: fields.name.value,
      image: '',
      imageId: '',
      instructions: fields.instructions.value,
      notes: fields.notes.value,
      sets: Math.max(1, parseInt(fields.sets.value, 10) || 1),
      reps: Math.max(1, parseInt(fields.reps.value, 10) || 1),
      resistance: Math.max(0, parseFloat(fields.resistance.value) || 0),
      resistanceType: fields.resistanceType.value
    };

    if (state.pendingFile) {
      return Img.putImage(state.pendingFile).then(function (imageId) {
        base.imageId = imageId;
        base.image = '';
        return base;
      });
    }

    if (state.clearImage) {
      return Promise.resolve(base);
    }

    var url = fields.image.value.trim();
    if (url) {
      base.image = url;
      base.imageId = '';
      return Promise.resolve(base);
    }

    base.image = state.existingImage || '';
    base.imageId = state.existingImageId || '';
    return Promise.resolve(base);
  }

  function fillExerciseForm(form, exercise) {
    var mode = getFormMode(form);
    var fields = form.elements;
    resetFormImageState(mode);
    fields.name.value = exercise.name;
    fields.instructions.value = exercise.instructions || '';
    fields.notes.value = exercise.notes || '';
    fields.image.value = exercise.image || '';
    fields.sets.value = exercise.sets;
    fields.reps.value = exercise.reps;
    fields.resistance.value = exercise.resistance;
    fields.resistanceType.value = exercise.resistanceType;
    if (fields.imageFile) fields.imageFile.value = '';
    formImageState[mode].existingImageId = exercise.imageId || '';
    formImageState[mode].existingImage = exercise.image || '';
    Img.resolveImageSrc(exercise).then(function (src) {
      formImageState[mode].previewUrl = src;
      showFormPreview(form, src);
    });
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
    readExerciseForm(els.editForm, current.id, currentWorkoutId).then(function (exercise) {
      workout.exercises[selectedExerciseIndex] = exercise;
      persistWorkouts();
      closeEdit();
      renderAll();
    }).catch(function (err) {
      console.error('Failed to save exercise image', err);
    });
  }

  function openReplace(index) {
    selectedExerciseIndex = index;
    els.replaceForm.reset();
    resetFormImageState('replace');
    els.replaceForm.elements.resistanceType.value = 'kg';
    els.replaceForm.elements.sets.value = 3;
    els.replaceForm.elements.reps.value = 10;
    showFormPreview(els.replaceForm, '');
    showOverlay(els.replaceOverlay);
  }

  function closeReplace() {
    hideOverlay(els.replaceOverlay);
  }

  function saveReplace(event) {
    event.preventDefault();
    var workout = getWorkout(currentWorkoutId);
    readExerciseForm(els.replaceForm, null, currentWorkoutId).then(function (replacement) {
      workout.exercises[selectedExerciseIndex] = replacement;
      persistWorkouts();
      closeReplace();
      renderAll();
    }).catch(function (err) {
      console.error('Failed to replace exercise image', err);
    });
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
    applyImageToElement(els.wimage, snap);
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
    renderHistory();
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

    els.historyList.addEventListener('click', function (event) {
      var card = event.target.closest('[data-history-index]');
      if (!card) return;
      openHistoryDetail(parseInt(card.dataset.historyIndex, 10));
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
    document.getElementById('history-detail-close-btn').addEventListener('click', closeHistoryDetail);
    els.editForm.addEventListener('submit', saveEdit);
    els.replaceForm.addEventListener('submit', saveReplace);
    bindImagePicker(els.editForm);
    bindImagePicker(els.replaceForm);
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

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then(function (registration) {
        function checkForUpdate() {
          registration.update().catch(function () {});
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
        checkForUpdate();
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.addEventListener('focus', checkForUpdate);
      })
      .catch(function (err) {
        console.warn('Service worker registration failed', err);
      });
  }

  function init() {
    if (!getWorkout(currentWorkoutId)) currentWorkoutId = 'a';
    bindEvents();
    renderAll();
    if (activeSession && activeSession.phase !== 'complete') showResumeBanner();
    registerServiceWorker();
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
    renderHistory: renderHistory,
    openHistoryDetail: openHistoryDetail,
    beginRest: beginRest,
    tickRest: tickRest,
    finishRestAdvance: finishRestAdvance,
    showWorkoutView: showWorkoutView,
    continueWorkout: continueWorkout,
    openEdit: openEdit,
    openReplace: openReplace
  };

  init();
})();
