(() => {
  const linkedTaskIds = () => {
    const ids = new Set();
    for (const dependency of deps || []) {
      ids.add(String(dependency.predecessor_id));
      ids.add(String(dependency.successor_id));
    }
    for (const branch of sequenceBranches || []) {
      for (const id of branch.task_ids || []) ids.add(String(id));
      if (branch.anchor_task_id) ids.add(String(branch.anchor_task_id));
    }
    return ids;
  };

  const sequenceForTask = id => {
    const branch = (sequenceBranches || []).find(item =>
      (item.task_ids || []).some(taskId => String(taskId) === id)
    );
    if (branch) {
      const anchored = sequenceGroupsCache.find(group =>
        group.some(task => String(task.id) === String(branch.anchor_task_id))
      );
      if (anchored) return String(anchored[0]?.id || '');
    }

    const direct = sequenceGroupsCache.find(group =>
      group.some(task => String(task.id) === id)
    );
    return String(direct?.[0]?.id || '');
  };

  document.addEventListener('dblclick', event => {
    const row = event.target.closest('#schedule .task-row[data-task-row-id]');
    if (!row) return;

    const id = String(row.dataset.taskRowId || '');
    if (!id || !linkedTaskIds().has(id)) return;

    const sequenceId = sequenceForTask(id);
    if (!sequenceId) return;

    event.preventDefault();
    selectedSequenceTaskId = id;
    setSequenceFilter(sequenceId);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const panel = document.querySelector('#sequence');
      const card = panel?.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
      if (!panel || !card) return;

      const panelRect = panel.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const targetTop = panel.scrollTop + cardRect.top - panelRect.top
        - (panel.clientHeight - cardRect.height) / 2;
      panel.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      card.classList.remove('task-highlight');
      void card.offsetWidth;
      card.classList.add('task-highlight');
      setTimeout(() => card.classList.remove('task-highlight'), 2400);
    }));
  });
})();
