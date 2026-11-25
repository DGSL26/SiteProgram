(() => {
  const escAdmin = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleNames = { editor: 'Full access', viewer: 'View only', phone_viewer: 'Phone view' };
  let usersCache = [], activityCache = [], selectedActivityUserId = '', busy = false;

  async function invoke(action, payload = {}) {
    if (!db || !user || projectRole !== 'admin') throw new Error('Only the administrator can manage accounts.');
    const { data, error } = await db.functions.invoke('siteprogram-admin', { body: { action, project_id: projectId, ...payload } });
    if (error) throw new Error(error.message || 'The administrator service could not be reached.');
    if (!data?.ok) throw new Error(data?.error || 'The request could not be completed.');
    return data;
  }

  function renderDashboard(box) {
    box.innerHTML = `<div class="admin-dashboard">
      <div class="admin-intro"><div><h2>Users &amp; activity</h2><p>Manage who can use SiteProgram for this site.</p></div><button class="btn" type="button" data-admin-refresh>Refresh</button></div>
      <div class="admin-privacy-note"><strong>Activity is recorded for account security.</strong><span>SiteProgram records successful sign-ins, the sections each user opens, and changes made to schedules. This history is visible to the administrator only.</span></div>
      <section class="admin-card"><div class="admin-card-heading"><div><h3>Add a user</h3><p>Set the password they will use. It stays as their password until you change it here.</p></div></div>
        <form class="admin-create-form" data-admin-create>
          <label>Email address<input type="email" name="email" autocomplete="off" required placeholder="name@example.com"></label>
          <label>Permanent password<input type="password" name="password" autocomplete="new-password" minlength="10" required placeholder="At least 10 characters"></label>
          <label>Access level<select name="role"><option value="editor">Full access — can view and edit</option><option value="viewer">View only — can see all sections</option><option value="phone_viewer">Phone view — Overview, Subcontractors and Site Map</option></select></label>
          <button class="btn primary" type="submit">Create account</button>
        </form>
      </section>
      <section class="admin-card"><div class="admin-card-heading"><div><h3>SiteProgram users</h3><p>Change access, update a password, or disable an account when someone leaves.</p></div><span class="admin-count" data-admin-user-count>Loading…</span></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Access</th><th>Last sign-in</th><th>Status</th><th>Account actions</th></tr></thead><tbody data-admin-users><tr><td colspan="5">Loading accounts…</td></tr></tbody></table></div></section>
      <section class="admin-card"><div class="admin-card-heading"><div><h3>Activity history</h3><p>Select an account to view its sign-ins, sections opened, and schedule changes.</p></div><button class="btn" type="button" data-admin-activity-refresh>Refresh history</button></div><div class="admin-activity-browser"><div class="admin-activity-accounts" data-admin-activity-accounts>Loading accounts…</div><div class="admin-activity-person hidden" data-admin-activity-person><div class="admin-activity-person-head"><button class="btn" type="button" data-admin-activity-back>‹ &nbsp; All accounts</button><strong data-admin-activity-person-name></strong></div><div class="admin-table-wrap"><table class="admin-table admin-activity-table"><thead><tr><th>When</th><th>Activity</th><th>Details</th></tr></thead><tbody data-admin-activity><tr><td colspan="3">Choose an account to view its history.</td></tr></tbody></table></div></div></div></section>
    </div>`;
    box.querySelector('[data-admin-refresh]').onclick = () => refreshUsers(box);
    box.querySelector('[data-admin-activity-refresh]').onclick = () => refreshActivity(box);
    box.querySelector('[data-admin-activity-back]').onclick = () => { selectedActivityUserId = ''; renderActivitySection(box); };
    box.querySelector('[data-admin-create]').onsubmit = event => createUser(event, box);
    refreshUsers(box); refreshActivity(box);
  }

  function dateText(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderUsers(box) {
    const body = box.querySelector('[data-admin-users]');
    const count = box.querySelector('[data-admin-user-count]');
    if (!body) return;
    count.textContent = `${usersCache.length} ${usersCache.length === 1 ? 'account' : 'accounts'}`;
    body.innerHTML = usersCache.map(person => {
      const own = String(person.user_id) === String(user.id), isAdmin = person.role === 'admin';
      const status = person.active ? '<span class="admin-status active">Active</span>' : '<span class="admin-status disabled">Disabled</span>';
      const role = isAdmin ? '<strong>Administrator</strong>' : `<select data-user-role="${escAdmin(person.user_id)}" aria-label="Access for ${escAdmin(person.email)}">${Object.entries(roleNames).map(([value,label]) => `<option value="${value}" ${person.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
      const actions = isAdmin ? '<span class="admin-protected">Admin account</span>' : `<div class="admin-user-actions"><button class="btn" type="button" data-password-user="${escAdmin(person.user_id)}">Set password</button><button class="btn ${person.active ? 'admin-disable' : ''}" type="button" data-active-user="${escAdmin(person.user_id)}" data-active-next="${person.active ? 'false' : 'true'}">${person.active ? 'Disable access' : 'Enable access'}</button>${own ? '<small>This is your account</small>' : ''}</div>`;
      return `<tr><td><strong>${escAdmin(person.email || 'Unknown email')}</strong></td><td>${role}</td><td>${escAdmin(dateText(person.last_sign_in_at))}</td><td>${status}</td><td>${actions}</td></tr>`;
    }).join('') || '<tr><td colspan="5">No user accounts found.</td></tr>';
    body.querySelectorAll('[data-user-role]').forEach(select => select.onchange = () => changeRole(select.dataset.userRole, select.value, box));
    body.querySelectorAll('[data-password-user]').forEach(button => button.onclick = () => setPassword(button.dataset.passwordUser, box));
    body.querySelectorAll('[data-active-user]').forEach(button => button.onclick = () => setActive(button.dataset.activeUser, button.dataset.activeNext === 'true', box));
    renderActivitySection(box);
  }

  async function refreshUsers(box) {
    if (!box.isConnected || busy) return;
    try { const data = await invoke('list_users'); usersCache = data.users || []; renderUsers(box); }
    catch (error) { const body = box.querySelector('[data-admin-users]'); if (body) body.innerHTML = `<tr><td colspan="5">${escAdmin(error.message)}</td></tr>`; window.note?.(error.message, true); }
  }

  async function refreshActivity(box) {
    if (!box.isConnected || busy) return;
    const body = box.querySelector('[data-admin-activity]'); if (!body) return;
    try {
      const data = await invoke('list_activity'); activityCache = data.activity || [];
      renderActivitySection(box);
    } catch (error) {
      const accounts = box.querySelector('[data-admin-activity-accounts]'), person = box.querySelector('[data-admin-activity-person]');
      if (selectedActivityUserId) { person?.classList.remove('hidden'); accounts?.classList.add('hidden'); body.innerHTML = `<tr><td colspan="3">${escAdmin(error.message)}</td></tr>`; }
      else if (accounts) accounts.innerHTML = `<p class="empty">${escAdmin(error.message)}</p>`;
    }
  }

  function renderActivitySection(box) {
    const accounts = box.querySelector('[data-admin-activity-accounts]'), person = box.querySelector('[data-admin-activity-person]'), body = box.querySelector('[data-admin-activity]');
    if (!accounts || !person || !body) return;
    const selected = usersCache.find(item => String(item.user_id) === String(selectedActivityUserId));
    accounts.classList.toggle('hidden', Boolean(selected)); person.classList.toggle('hidden', !selected);
    if (!selected) {
      accounts.innerHTML = usersCache.map(item => {
        const count = activityCache.filter(event => String(event.actor_user_id) === String(item.user_id)).length;
        return `<button class="admin-activity-account" type="button" data-activity-account="${escAdmin(item.user_id)}"><span class="admin-activity-avatar">${escAdmin((item.email || '?').slice(0,1).toUpperCase())}</span><span class="admin-activity-account-info"><strong>${escAdmin(item.email || 'Unknown email')}</strong><small>${escAdmin(roleNames[item.role] || 'Administrator')} · Last sign-in ${escAdmin(dateText(item.last_sign_in_at))}</small></span><span class="admin-activity-count">${count} ${count === 1 ? 'entry' : 'entries'}</span><span class="admin-activity-arrow">›</span></button>`;
      }).join('') || '<p class="empty">No registered accounts yet.</p>';
      accounts.querySelectorAll('[data-activity-account]').forEach(button => button.onclick = () => { selectedActivityUserId = button.dataset.activityAccount; renderActivitySection(box); });
      return;
    }
    box.querySelector('[data-admin-activity-person-name]').textContent = selected.email || 'Account activity';
    const rows = activityCache.filter(item => String(item.actor_user_id) === String(selected.user_id));
    body.innerHTML = rows.map(item => `<tr><td>${escAdmin(dateText(item.created_at))}</td><td>${escAdmin(activityLabel(item.event_type))}</td><td>${escAdmin(item.summary || '')}${detailsText(item.details) ? `<small class="admin-change-detail">${escAdmin(detailsText(item.details))}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="3">No activity recorded for this account yet.</td></tr>';
  }

  function activityLabel(type) {
    return ({ sign_in: 'Signed in', sign_out: 'Signed out', section_view: 'Opened section', data_change: 'Changed schedule', user_created: 'Added user', user_role_changed: 'Changed access', user_password_reset: 'Set user password', user_disabled: 'Disabled access', user_enabled: 'Enabled access' })[type] || String(type || 'Activity').replaceAll('_', ' ');
  }

  function detailsText(details) {
    if (!details || typeof details !== 'object') return '';
    return Object.entries(details).map(([field, change]) => {
      if (!change || typeof change !== 'object' || !('from' in change || 'to' in change)) return '';
      const value = input => input == null || input === '' ? 'blank' : Array.isArray(input) ? input.join(', ') : typeof input === 'object' ? JSON.stringify(input) : String(input);
      return `${field.replaceAll('_', ' ')}: ${value(change.from)} → ${value(change.to)}`;
    }).filter(Boolean).join(' · ');
  }

  async function createUser(event, box) {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type="submit"]'), values = new FormData(form);
    button.disabled = true;
    try {
      await invoke('create_user', { email: String(values.get('email')).trim(), password: String(values.get('password')), role: String(values.get('role')) });
      form.reset(); window.note?.('Account created. Share the email and password with the user securely.'); await refreshUsers(box); await refreshActivity(box);
    } catch (error) { window.note?.(error.message, true); }
    finally { button.disabled = false; }
  }

  async function changeRole(userId, role, box) {
    try { await invoke('set_role', { user_id: userId, role }); window.note?.('Access level updated.'); await refreshUsers(box); await refreshActivity(box); }
    catch (error) { window.note?.(error.message, true); await refreshUsers(box); }
  }

  async function setPassword(userId, box) {
    const password = window.prompt('Enter the new permanent password (at least 10 characters).');
    if (password === null) return;
    if (password.length < 10) { window.note?.('Use a password with at least 10 characters.', true); return; }
    try { await invoke('set_password', { user_id: userId, password }); window.note?.('Password updated. They will need it at their next sign-in. Use Disable access to remove access immediately.'); await refreshUsers(box); await refreshActivity(box); }
    catch (error) { window.note?.(error.message, true); }
  }

  async function setActive(userId, active, box) {
    const message = active ? 'Enable this account?' : 'Disable this account now? They will lose access to SiteProgram.';
    if (!window.confirm(message)) return;
    try { await invoke('set_active', { user_id: userId, active }); window.note?.(active ? 'Account enabled.' : 'Access disabled.'); await refreshUsers(box); await refreshActivity(box); }
    catch (error) { window.note?.(error.message, true); }
  }

  async function recordActivity(eventType, section = '') {
    if (!user || !projectId || !db || !['sign_in','sign_out','section_view'].includes(eventType)) return;
    try {
      const { error } = await db.functions.invoke('siteprogram-admin', { body: { action: 'record_activity', project_id: projectId, event_type: eventType, section } });
      if (error) throw error;
    } catch (_) { /* Activity logging must not block normal app use. */ }
  }

  window.renderAdminDashboard = renderDashboard;
  window.recordSiteProgramActivity = recordActivity;
})();
