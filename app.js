(function () {
  'use strict';

  var D = window.MyFitData;
  var Img = window.MyFitImages;
  var workouts = D.loadWorkouts();
  var library = D.loadLibrary();
  var currentWorkoutId = D.loadLastDay() || 'a';
  var selectedExerciseIndex = 0;
  var selectedLibraryIndex = -1;
  var pickMode = ''; // 'session' | 'library-detail'
  var activeSession = D.loadActiveSession();
  var restTimerId = null;
  var resumePromptShown = false;
  var formImageState = {
    edit: { pendingFile: null, clearImage: false, existingImageId: '', existingImage: '', previewUrl: '' },
    replace: { pendingFile: null, clearImage: false, existingImageId: '', existingImage: '', previewUrl: '' },
    add: { pendingFile: null, clearImage: false, existingImageId: '', existingImage: '', previewUrl: '' }
  };

  var els = {
    welcomeScreen: document.getElementById('welcome-screen'),
    welcomeBg: document.getElementById('welcome-bg'),
    appHome: document.getElementById('app-home'),
    libraryScreen: document.getElementById('library-screen'),
    libraryList: document.getElementById('library-list'),
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
    wSetResistance: document.getElementById('w-set-resistance'),
    wSetResistanceType: document.getElementById('w-set-resistance-type'),
    wResistanceChip: document.getElementById('w-resistance-chip'),
    wResistanceEditor: document.getElementById('w-resistance-editor'),
    wResistanceDoneBtn: document.getElementById('w-resistance-done-btn'),
    restOverlay: document.getElementById('rest-overlay'),
    restLabel: document.getElementById('rest-label'),
    restTimer: document.getElementById('rest-timer'),
    completionOverlay: document.getElementById('completion-overlay'),
    completionStats: document.getElementById('completion-stats'),
    editOverlay: document.getElementById('edit-overlay'),
    replaceOverlay: document.getElementById('replace-overlay'),
    addExerciseOverlay: document.getElementById('add-exercise-overlay'),
    pickExerciseOverlay: document.getElementById('pick-exercise-overlay'),
    pickExerciseList: document.getElementById('pick-exercise-list'),
    pickExerciseTitle: document.getElementById('pick-exercise-title'),
    pickExerciseIntro: document.getElementById('pick-exercise-intro'),
    addToScheduleOverlay: document.getElementById('add-to-schedule-overlay'),
    editForm: document.getElementById('edit-form'),
    replaceForm: document.getElementById('replace-form'),
    addExerciseForm: document.getElementById('add-exercise-form'),
    historyDetailOverlay: document.getElementById('history-detail-overlay'),
    historyDetailContent: document.getElementById('history-detail-content')
  };

  function persistLibrary() {
    D.saveLibrary(library);
  }

  function getDisplayedExercises() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return [];
    return D.getOrderedWorkoutExercises(workout);
  }

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
      imgEl.onerror = function () {
        imgEl.removeAttribute('src');
        imgEl.style.display = 'none';
      };
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
    var exercises = getDisplayedExercises();
    var estimated = D.estimateWorkoutSeconds({ exercises: exercises });
    els.title.textContent = workout.title;
    els.meta.textContent = exercises.length + ' bài • khoảng ' + D.formatDuration(estimated);
    D.saveLastDay(currentWorkoutId);
  }

  function placeholderImageHtml(className) {
    return '<div class="' + className + ' placeholder" data-image-slot>🏋️</div>';
  }

  function renderList() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout || !els.list) return;
    var exercises = getDisplayedExercises();
    els.list.innerHTML = exercises.map(function (exercise, index) {
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
            '<div class="order-btns">' +
              '<button type="button" data-action="move-up" data-index="' + index + '" aria-label="Đưa lên">↑</button>' +
              '<button type="button" data-action="move-down" data-index="' + index + '" aria-label="Đưa xuống">↓</button>' +
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
    exercises.forEach(function (exercise, index) {
      var slot = cards[index] && cards[index].querySelector('[data-image-slot]');
      if (!slot) return;
      Img.resolveImageSrc(exercise).then(function (src) {
        if (!src || !slot.parentNode) return;
        if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return;
        var img = document.createElement('img');
        img.className = 'card-image';
        img.alt = '';
        img.onerror = function () {
          if (img.parentNode) {
            var fallback = document.createElement('div');
            fallback.className = 'card-image placeholder';
            fallback.setAttribute('data-image-slot', '');
            fallback.textContent = '🏋️';
            img.replaceWith(fallback);
          }
        };
        img.src = src;
        slot.replaceWith(img);
      }).catch(function () {});
    });
  }

  function moveDisplayedExercise(index, direction) {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    var exercises = getDisplayedExercises();
    var target = index + direction;
    if (target < 0 || target >= exercises.length) return;
    var swapped = exercises.slice();
    var tmp = swapped[index];
    swapped[index] = swapped[target];
    swapped[target] = tmp;
    D.setDayOrder(currentWorkoutId, swapped.map(function (ex) { return ex.id; }));
    renderAll();
  }

  function saveDisplayedOrderAsDefault() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    var ordered = getDisplayedExercises();
    workout.exercises = ordered.slice();
    persistWorkouts();
    D.clearDayOrder(currentWorkoutId);
    renderAll();
  }
  function renderHistory() {
    if (!els.historyList) return;
    var history = D.loadHistory();
    if (!history.length) {
      els.historyList.innerHTML =
        '<div class="card history-empty-card">' +
          '<div class="name">Chưa có lịch sử</div>' +
          '<div class="note">Hoàn thành một buổi tập để xem tên buổi, thời gian dự kiến/thực tế và chi tiết từng bài tại đây.</div>' +
        '</div>';
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
          '<div class="history-row"><span>Thời gian dự kiến</span><strong>' + escapeHtml(D.formatClockDuration(entry.estimatedDuration)) + '</strong></div>' +
          '<div class="history-row"><span>Thời gian thực tế</span><strong>' + escapeHtml(D.formatClockDuration(entry.actualDuration)) + '</strong></div>' +
          '<div class="history-row"><span>Số bài</span><strong>' + summary.exerciseCount + '</strong></div>' +
          '<div class="history-row"><span>Set dự kiến</span><strong>' + summary.plannedSets + '</strong></div>' +
          '<div class="history-row"><span>Set thực tế</span><strong>' + summary.actualSets + '</strong></div>' +
          '<span class="badge">Xem chi tiết</span>' +
        '</div>'
      );
    }).join('');
  }

  function jumpToHistory() {
    var section = document.getElementById('history-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    function renderHistoryItems(items, heading) {
      if (!items.length) return;
      html += '<div class="history-group-title">' + escapeHtml(heading) + '</div>';
      items.forEach(function (item) {
        var globalIndex = entry.exercises.indexOf(item);
        var snap = item.snapshot || {};
        var status = item.completionStatus || 'pending';
        var ensured = D.ensureSetLogs(D.clone(item));
        var setLines = (ensured.setLogs || []).filter(function (log) { return log.completed; });
        if (!setLines.length && (item.actualSetsCompleted || 0) > 0) {
          setLines = ensured.setLogs || [];
        }
        html +=
          '<div class="history-exercise" data-history-ex="' + globalIndex + '">' +
            placeholderImageHtml('card-image') +
            '<div class="name">' + escapeHtml(snap.name || 'Bài tập') + '</div>' +
            '<div class="meta">Planned: ' + (item.plannedSets || snap.sets || 0) + ' × ' + (item.plannedReps || snap.reps || 0) + '</div>' +
            '<div class="meta">Actual sets: ' + (item.actualSetsCompleted || 0) + '</div>' +
            setLines.map(function (log) {
              return '<div class="set-log-line">' + escapeHtml(D.formatSetLogLine(log)) + '</div>';
            }).join('') +
            '<span class="status-pill ' + escapeHtml(status) + '">' + escapeHtml(D.completionStatusLabel(status)) + '</span>' +
          '</div>';
      });
    }

    var scheduled = (entry.exercises || []).filter(function (item) { return item.role !== 'supplemental'; });
    var supplemental = (entry.exercises || []).filter(function (item) { return item.role === 'supplemental'; });
    if (entry.sessionKind === 'library' && !supplemental.length) {
      renderHistoryItems(scheduled, 'Bài đã tập');
    } else {
      renderHistoryItems(scheduled, 'Bài theo lịch');
      renderHistoryItems(supplemental, 'Bài bổ sung');
    }
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
        img.onerror = function () {
          if (img.parentNode) {
            var fallback = document.createElement('div');
            fallback.className = 'card-image placeholder';
            fallback.setAttribute('data-image-slot', '');
            fallback.textContent = '🏋️';
            img.replaceWith(fallback);
          }
        };
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
    if (els.libraryScreen && !els.libraryScreen.hidden) renderLibrary();
  }

  function selectWorkout(workoutId) {
    if (!getWorkout(workoutId)) return;
    currentWorkoutId = workoutId;
    D.saveLastDay(workoutId);
    renderAll();
  }

  function openDetail(index) {
    selectedExerciseIndex = index;
    var exercises = getDisplayedExercises();
    var exercise = exercises[index];
    if (!exercise) return;
    els.dprog.textContent = 'Bài ' + (index + 1) + '/' + exercises.length;
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
    if (form === els.editForm) return 'edit';
    if (form === els.addExerciseForm) return 'add';
    return 'replace';
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

  function findWorkoutExerciseIndexByDisplayed(index) {
    var displayed = getDisplayedExercises()[index];
    var workout = getWorkout(currentWorkoutId);
    if (!displayed || !workout) return -1;
    return workout.exercises.findIndex(function (ex) { return ex.id === displayed.id; });
  }

  function openEdit(index) {
    selectedExerciseIndex = index;
    var exercise = getDisplayedExercises()[index];
    if (!exercise) return;
    fillExerciseForm(els.editForm, exercise);
    showOverlay(els.editOverlay);
  }

  function closeEdit() {
    hideOverlay(els.editOverlay);
  }

  function saveEdit(event) {
    event.preventDefault();
    var workout = getWorkout(currentWorkoutId);
    var displayed = getDisplayedExercises()[selectedExerciseIndex];
    if (!workout || !displayed) return;
    var realIndex = findWorkoutExerciseIndexByDisplayed(selectedExerciseIndex);
    if (realIndex < 0) return;
    readExerciseForm(els.editForm, displayed.id, currentWorkoutId).then(function (exercise) {
      workout.exercises[realIndex] = exercise;
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
    var realIndex = findWorkoutExerciseIndexByDisplayed(selectedExerciseIndex);
    if (!workout || realIndex < 0) return;
    readExerciseForm(els.replaceForm, null, currentWorkoutId).then(function (replacement) {
      workout.exercises[realIndex] = replacement;
      persistWorkouts();
      closeReplace();
      renderAll();
    }).catch(function (err) {
      console.error('Failed to replace exercise image', err);
    });
  }
  function applyWelcomeBackground() {
    if (!els.welcomeBg) return;
    var src = D.WELCOME_BACKGROUND_IMAGE || 'assets/welcome-background.jpg';
    els.welcomeBg.style.backgroundImage = 'url("' + src.replace(/"/g, '\\"') + '")';
  }

  function showWelcome() {
    if (els.welcomeScreen) els.welcomeScreen.hidden = false;
    if (els.appHome) els.appHome.hidden = true;
    if (els.libraryScreen) els.libraryScreen.hidden = true;
  }

  function showHome() {
    if (els.welcomeScreen) els.welcomeScreen.hidden = true;
    if (els.appHome) els.appHome.hidden = false;
    if (els.libraryScreen) els.libraryScreen.hidden = true;
    renderAll();
  }

  function selectTodayWorkout() {
    var todayId = D.getTodayWorkoutId();
    if (getWorkout(todayId)) {
      selectWorkout(todayId);
      return todayId;
    }
    if (!getWorkout(currentWorkoutId)) selectWorkout('a');
    return currentWorkoutId;
  }

  function welcomeStartNow() {
    selectTodayWorkout();
    showHome();
    if (activeSession && activeSession.phase !== 'complete') {
      resumePromptShown = false;
      showResumeBanner();
      return;
    }
    resumePromptShown = true;
    startWorkout(0);
  }

  function welcomeOpenSchedule() {
    selectTodayWorkout();
    showHome();
    if (activeSession && activeSession.phase !== 'complete') {
      resumePromptShown = false;
      showResumeBanner();
    }
  }

  function welcomeOpenLibrary() {
    showLibrary();
  }

  function renderLibrary() {
    if (!els.libraryList) return;
    var exercises = (library && library.exercises) || [];
    if (!exercises.length) {
      els.libraryList.innerHTML = '<div class="card"><div class="name">Chưa có bài trong thư viện</div><div class="note">Bấm “+ Thêm bài tập” để tạo bài lẻ.</div></div>';
      return;
    }
    els.libraryList.innerHTML = exercises.map(function (exercise, index) {
      return (
        '<div class="card" data-library-index="' + index + '">' +
          '<div class="card-top">' +
            placeholderImageHtml('card-image') +
            '<div class="card-body">' +
              '<div class="name">' + escapeHtml(exercise.name) + '</div>' +
              '<div class="meta">' + escapeHtml(D.formatExerciseMeta(exercise)) + '</div>' +
              (exercise.instructions ? '<div class="note">' + escapeHtml(exercise.instructions) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="library-actions">' +
            '<button type="button" data-library-action="train" data-index="' + index + '">Tập bài này</button>' +
            '<button type="button" data-library-action="add-schedule" data-index="' + index + '">Thêm vào lịch tập</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    var cards = els.libraryList.querySelectorAll('.card');
    exercises.forEach(function (exercise, index) {
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

  function showLibrary() {
    if (els.welcomeScreen) els.welcomeScreen.hidden = true;
    if (els.appHome) els.appHome.hidden = true;
    if (els.libraryScreen) els.libraryScreen.hidden = false;
    renderLibrary();
  }

  function openAddExerciseForm() {
    if (!els.addExerciseForm) return;
    els.addExerciseForm.reset();
    resetFormImageState('add');
    els.addExerciseForm.elements.sets.value = 3;
    els.addExerciseForm.elements.reps.value = 12;
    els.addExerciseForm.elements.resistance.value = 0;
    els.addExerciseForm.elements.resistanceType.value = 'kg';
    showFormPreview(els.addExerciseForm, '');
    showOverlay(els.addExerciseOverlay);
  }

  function closeAddExerciseForm() {
    hideOverlay(els.addExerciseOverlay);
  }

  function saveAddExercise(event) {
    event.preventDefault();
    readExerciseForm(els.addExerciseForm, null, 'lib').then(function (exercise) {
      if (!library.exercises) library.exercises = [];
      library.exercises.push(exercise);
      persistLibrary();
      closeAddExerciseForm();
      renderLibrary();
    }).catch(function (err) {
      console.error('Failed to add library exercise', err);
    });
  }

  function startLibraryExercise(index) {
    var exercise = library.exercises[index];
    if (!exercise) return;
    if (activeSession && activeSession.phase !== 'complete' && !resumePromptShown) {
      // If a schedule session is in progress, prefer adding as supplemental.
      addExerciseToActiveSession(exercise);
      return;
    }
    resumePromptShown = true;
    activeSession = D.createWorkoutSession(
      { id: 'library', title: 'Tập theo bài · ' + exercise.name, exercises: [exercise] },
      { sessionKind: 'library', workoutName: 'Tập theo bài · ' + exercise.name }
    );
    persistSession();
    showWorkoutView();
  }

  function openAddToSchedulePicker(index) {
    selectedLibraryIndex = index;
    showOverlay(els.addToScheduleOverlay);
  }

  function closeAddToSchedulePicker() {
    hideOverlay(els.addToScheduleOverlay);
  }

  function addLibraryExerciseToSchedule(workoutId) {
    var exercise = library.exercises[selectedLibraryIndex];
    var workout = getWorkout(workoutId);
    if (!exercise || !workout) return;
    var copy = D.clone(exercise);
    copy.id = D.makeExerciseId(workoutId, exercise.name + '-' + Date.now());
    workout.exercises.push(copy);
    persistWorkouts();
    closeAddToSchedulePicker();
    currentWorkoutId = workoutId;
    showHome();
  }

  function openPickExerciseForSession() {
    pickMode = 'session';
    if (els.pickExerciseTitle) els.pickExerciseTitle.textContent = 'Thêm bài vào buổi đang tập';
    if (els.pickExerciseIntro) els.pickExerciseIntro.textContent = 'Bài được chọn sẽ là BÀI BỔ SUNG trong cùng active session / History.';
    renderPickExerciseList();
    showOverlay(els.pickExerciseOverlay);
  }

  function closePickExercise() {
    hideOverlay(els.pickExerciseOverlay);
    pickMode = '';
  }

  function renderPickExerciseList() {
    if (!els.pickExerciseList) return;
    var exercises = (library && library.exercises) || [];
    if (!exercises.length) {
      els.pickExerciseList.innerHTML = '<div class="pick-empty">Thư viện trống. Hãy thêm bài ở “Tập theo bài”.</div>';
      return;
    }
    els.pickExerciseList.innerHTML = exercises.map(function (exercise, index) {
      return (
        '<div class="card">' +
          '<div class="name">' + escapeHtml(exercise.name) + '</div>' +
          '<div class="meta">' + escapeHtml(D.formatExerciseMeta(exercise)) + '</div>' +
          '<button type="button" class="btn" data-pick-index="' + index + '">Thêm bài này</button>' +
        '</div>'
      );
    }).join('');
  }

  function addExerciseToActiveSession(exercise) {
    if (!activeSession || activeSession.phase === 'complete') {
      // Start a schedule session if missing, then append.
      var workout = getWorkout(currentWorkoutId);
      if (!workout) return;
      resumePromptShown = true;
      activeSession = D.createWorkoutSession(workout);
    }
    var item = D.createSessionExercise(exercise, 'supplemental');
    activeSession.exercises.push(item);
    activeSession.estimatedDuration = D.estimateWorkoutSeconds({
      exercises: activeSession.exercises.map(function (ex) { return ex.snapshot; })
    });
    persistSession();
    closePickExercise();
    if (els.workoutOverlay && els.workoutOverlay.style.display === 'flex') {
      // stay on current exercise
      showWorkoutView();
    } else {
      // jump to the newly added exercise
      activeSession.currentExerciseIndex = activeSession.exercises.length - 1;
      activeSession.currentSet = 1;
      activeSession.phase = 'exercise';
      persistSession();
      showWorkoutView();
    }
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

  function formatResistanceChip(log) {
    return D.formatResistance({
      resistance: log && log.resistance != null ? log.resistance : 0,
      resistanceType: (log && log.resistanceType) || 'kg'
    });
  }

  function isResistanceEditorOpen() {
    return !!(els.wResistanceEditor && !els.wResistanceEditor.hidden);
  }

  function closeResistanceEditor(options) {
    options = options || {};
    if (isResistanceEditorOpen() && options.sync !== false) {
      syncUiResistanceIntoSession();
      persistSession();
    }
    if (els.wResistanceEditor) els.wResistanceEditor.hidden = true;
    if (els.wSetResistance) els.wSetResistance.blur();
    if (els.wSetResistanceType) els.wSetResistanceType.blur();
    updateResistanceChipLabel();
  }

  function openResistanceEditor() {
    var current = getCurrentExercise();
    if (!current || !activeSession) return;
    D.ensureSetLogs(current);
    var setIndex = Math.max(0, (activeSession.currentSet || 1) - 1);
    var log = current.setLogs[setIndex] || current.setLogs[0];
    writeCurrentSetResistanceToUi(log);
    if (els.wResistanceEditor) els.wResistanceEditor.hidden = false;
    // Do not autofocus — optional edit only.
  }

  function updateResistanceChipLabel() {
    if (!els.wResistanceChip || !activeSession) return;
    var current = getCurrentExercise();
    if (!current) return;
    D.ensureSetLogs(current);
    var setIndex = Math.max(0, (activeSession.currentSet || 1) - 1);
    var log = current.setLogs[setIndex] || current.setLogs[0];
    els.wResistanceChip.textContent = formatResistanceChip(log);
  }

  function readCurrentSetResistanceFromUi() {
    if (!els.wSetResistance) return null;
    return {
      resistance: Math.max(0, parseFloat(els.wSetResistance.value) || 0),
      resistanceType: (els.wSetResistanceType && els.wSetResistanceType.value) || 'kg'
    };
  }

  function writeCurrentSetResistanceToUi(log) {
    if (!log) return;
    if (els.wSetResistance) {
      els.wSetResistance.value = log.resistance != null ? log.resistance : 0;
    }
    if (els.wSetResistanceType) {
      els.wSetResistanceType.value = log.resistanceType || 'kg';
    }
    if (els.wResistanceChip) {
      els.wResistanceChip.textContent = formatResistanceChip(log);
    }
  }

  function syncUiResistanceIntoSession() {
    var current = getCurrentExercise();
    if (!current || !activeSession) return;
    // Only apply editor values when editor is open (user chose to edit).
    if (!isResistanceEditorOpen()) return;
    D.ensureSetLogs(current);
    var setIndex = Math.max(0, (activeSession.currentSet || 1) - 1);
    if (!current.setLogs[setIndex]) return;
    var values = readCurrentSetResistanceFromUi();
    if (!values) return;
    current.setLogs[setIndex].resistance = values.resistance;
    current.setLogs[setIndex].resistanceType = values.resistanceType;
  }

  function updatePrimaryActionLabel() {
    var btn = document.getElementById('complete-set-btn');
    if (!btn || !activeSession) return;
    var current = getCurrentExercise();
    if (!current) return;
    var plannedSets = current.snapshot.sets;
    var isLastSet = activeSession.currentSet >= plannedSets;
    var isLastExercise = activeSession.currentExerciseIndex >= activeSession.exercises.length - 1;
    if (isLastSet && isLastExercise) {
      btn.textContent = 'Hoàn thành buổi tập';
    } else if (isLastSet) {
      btn.textContent = 'Bài tiếp theo';
    } else {
      btn.textContent = 'Hoàn thành SET';
    }
  }

  function resetWorkoutScroll() {
    var scrollEl = document.querySelector('.workout-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  function showWorkoutView() {
    var current = getCurrentExercise();
    if (!current) return;
    D.ensureSetLogs(current);
    var snap = current.snapshot;
    var setIndex = Math.max(0, (activeSession.currentSet || 1) - 1);
    var log = current.setLogs[setIndex] || current.setLogs[0];
    els.wprog.textContent = 'Bài ' + (activeSession.currentExerciseIndex + 1) + '/' + activeSession.exercises.length +
      (current.role === 'supplemental' ? ' · Bổ sung' : '');
    els.wname.textContent = snap.name;
    els.wmeta.textContent = D.formatExerciseMeta(snap);
    els.wset.textContent = [snap.instructions, snap.notes].filter(Boolean).join('\n\n');
    els.wsetDisplay.textContent = 'SET ' + activeSession.currentSet + ' / ' + snap.sets;
    els.wrepsDisplay.textContent = snap.reps + ' REPS';
    if (els.wResistanceEditor) els.wResistanceEditor.hidden = true;
    writeCurrentSetResistanceToUi(log);
    updatePrimaryActionLabel();
    applyImageToElement(els.wimage, snap);
    hideOverlay(els.restOverlay);
    hideOverlay(els.completionOverlay);
    showOverlay(els.workoutOverlay, 'flex');
    resetWorkoutScroll();
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
    D.ensureSetLogs(current);
    if (isResistanceEditorOpen()) {
      syncUiResistanceIntoSession();
      closeResistanceEditor({ sync: false });
    }
    var setIndex = Math.max(0, (activeSession.currentSet || 1) - 1);
    var log = current.setLogs[setIndex];
    if (log) {
      log.completed = true;
      log.reps = current.snapshot.reps;
      current.actualResistance = log.resistance;
    }
    current.actualSetsCompleted += 1;
    current.actualReps = current.snapshot.reps;
    current.completionStatus = 'in-progress';
    var plannedSets = current.snapshot.sets;
    if (activeSession.currentSet < plannedSets) {
      // Prefill next set with this set's resistance (UX), without changing exercise default.
      var next = current.setLogs[setIndex + 1];
      if (next && log) {
        next.resistance = log.resistance;
        next.resistanceType = log.resistanceType;
      }
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

    var jumpHistoryBtn = document.getElementById('jump-history-btn');
    if (jumpHistoryBtn) jumpHistoryBtn.addEventListener('click', jumpToHistory);

    var homeBackBtn = document.getElementById('home-back-btn');
    if (homeBackBtn) homeBackBtn.addEventListener('click', showWelcome);

    var saveOrderBtn = document.getElementById('save-order-default-btn');
    if (saveOrderBtn) saveOrderBtn.addEventListener('click', saveDisplayedOrderAsDefault);

    var addToSessionBtn = document.getElementById('add-to-session-btn');
    if (addToSessionBtn) addToSessionBtn.addEventListener('click', openPickExerciseForSession);

    els.list.addEventListener('click', function (event) {
      var target = event.target.closest('[data-action]');
      if (!target) return;
      var index = parseInt(target.dataset.index, 10);
      if (target.dataset.action === 'detail') openDetail(index);
      if (target.dataset.action === 'edit') openEdit(index);
      if (target.dataset.action === 'replace') openReplace(index);
      if (target.dataset.action === 'move-up') moveDisplayedExercise(index, -1);
      if (target.dataset.action === 'move-down') moveDisplayedExercise(index, 1);
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

    if (els.addExerciseForm) {
      document.getElementById('add-exercise-close-btn').addEventListener('click', closeAddExerciseForm);
      els.addExerciseForm.addEventListener('submit', saveAddExercise);
      bindImagePicker(els.addExerciseForm);
    }
    var libraryAddBtn = document.getElementById('library-add-btn');
    if (libraryAddBtn) libraryAddBtn.addEventListener('click', openAddExerciseForm);

    if (els.libraryList) {
      els.libraryList.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-library-action]');
        if (!btn) return;
        var index = parseInt(btn.dataset.index, 10);
        if (btn.dataset.libraryAction === 'train') startLibraryExercise(index);
        if (btn.dataset.libraryAction === 'add-schedule') openAddToSchedulePicker(index);
      });
    }

    if (els.pickExerciseList) {
      document.getElementById('pick-exercise-close-btn').addEventListener('click', closePickExercise);
      els.pickExerciseList.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-pick-index]');
        if (!btn) return;
        var exercise = library.exercises[parseInt(btn.dataset.pickIndex, 10)];
        if (!exercise) return;
        if (pickMode === 'session') addExerciseToActiveSession(exercise);
      });
    }

    if (els.addToScheduleOverlay) {
      document.getElementById('add-to-schedule-close-btn').addEventListener('click', closeAddToSchedulePicker);
      els.addToScheduleOverlay.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-add-schedule]');
        if (!btn) return;
        addLibraryExerciseToSchedule(btn.dataset.addSchedule);
      });
    }

    if (els.wResistanceChip) {
      els.wResistanceChip.addEventListener('click', function () {
        if (!activeSession || activeSession.phase === 'complete') return;
        if (isResistanceEditorOpen()) {
          closeResistanceEditor();
          return;
        }
        openResistanceEditor();
      });
    }
    if (els.wResistanceDoneBtn) {
      els.wResistanceDoneBtn.addEventListener('click', function () {
        closeResistanceEditor();
        persistSession();
      });
    }
    if (els.wSetResistance) {
      els.wSetResistance.addEventListener('change', function () {
        syncUiResistanceIntoSession();
        updateResistanceChipLabel();
        persistSession();
      });
    }
    if (els.wSetResistanceType) {
      els.wSetResistanceType.addEventListener('change', function () {
        syncUiResistanceIntoSession();
        updateResistanceChipLabel();
        persistSession();
      });
    }

    document.getElementById('complete-set-btn').addEventListener('click', completeSet);
    document.getElementById('complete-exercise-btn').addEventListener('click', function () {
      if (isResistanceEditorOpen()) closeResistanceEditor();
      completeExercise(true);
    });
    document.getElementById('workout-close-btn').addEventListener('click', closeWorkout);
    var workoutAddBtn = document.getElementById('workout-add-exercise-btn');
    if (workoutAddBtn) workoutAddBtn.addEventListener('click', openPickExerciseForSession);
    document.getElementById('rest-skip-btn').addEventListener('click', skipRest);
    document.getElementById('rest-add-btn').addEventListener('click', addRestSeconds);
    document.getElementById('completion-home-btn').addEventListener('click', closeCompletion);
    document.getElementById('resume-continue-btn').addEventListener('click', continueWorkout);
    document.getElementById('resume-discard-btn').addEventListener('click', discardWorkout);

    var welcomeStartBtn = document.getElementById('welcome-start-btn');
    var welcomeScheduleBtn = document.getElementById('welcome-schedule-btn');
    var welcomeLibraryBtn = document.getElementById('welcome-library-btn');
    var libraryBackBtn = document.getElementById('library-back-btn');
    var libraryToScheduleBtn = document.getElementById('library-to-schedule-btn');
    if (welcomeStartBtn) welcomeStartBtn.addEventListener('click', welcomeStartNow);
    if (welcomeScheduleBtn) welcomeScheduleBtn.addEventListener('click', welcomeOpenSchedule);
    if (welcomeLibraryBtn) welcomeLibraryBtn.addEventListener('click', welcomeOpenLibrary);
    if (libraryBackBtn) libraryBackBtn.addEventListener('click', showWelcome);
    if (libraryToScheduleBtn) libraryToScheduleBtn.addEventListener('click', welcomeOpenSchedule);
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
    applyWelcomeBackground();
    bindEvents();
    renderAll();
    showWelcome();
    if (activeSession && activeSession.phase !== 'complete') {
      resumePromptShown = false;
    }
    registerServiceWorker();
  }

  window.MyFitApp = {
    getWorkouts: function () { return workouts; },
    getLibrary: function () { return library; },
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
    jumpToHistory: jumpToHistory,
    beginRest: beginRest,
    tickRest: tickRest,
    finishRestAdvance: finishRestAdvance,
    showWorkoutView: showWorkoutView,
    continueWorkout: continueWorkout,
    openEdit: openEdit,
    openReplace: openReplace,
    showWelcome: showWelcome,
    showHome: showHome,
    showLibrary: showLibrary,
    welcomeStartNow: welcomeStartNow,
    welcomeOpenSchedule: welcomeOpenSchedule,
    welcomeOpenLibrary: welcomeOpenLibrary,
    moveDisplayedExercise: moveDisplayedExercise,
    saveDisplayedOrderAsDefault: saveDisplayedOrderAsDefault,
    addExerciseToActiveSession: addExerciseToActiveSession,
    startLibraryExercise: startLibraryExercise
  };

  init();
})();
