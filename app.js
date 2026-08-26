(() => {
  const token = () => sessionStorage.getItem('wikel-token');
  const api = async (path, options = {}) => {
    const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Er ging iets mis.'); return data;
  };
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' })[char]);
  const statusFor = product => !product.active ? ['Tijdelijk niet beschikbaar', 'paused'] : product.stock === 0 ? ['Uitverkocht', 'sold-out'] : product.stock <= 3 ? ['Bijna op', 'low'] : ['Beschikbaar', 'available'];
  const errorMessage = error => `Kan voorraad niet laden: ${error.message}. Probeer het later opnieuw.`;
  async function renderPublic() {
    const list = document.getElementById('productList'); if (!list) return;
    try { const products = await api('/products'); list.innerHTML = products.map(product => { const [label, state] = statusFor(product); return `<article class="product-card ${state}"><div class="product-icon" aria-hidden="true">${product.icon || '•'}</div><div class="product-name">${escapeHtml(product.name)}</div><div class="stock"><strong>${product.active ? product.stock : '—'}</strong><span>op voorraad</span></div><div class="status ${state}"><span></span>${label}</div></article>`; }).join(''); document.getElementById('lastUpdated').textContent = `Laatst bijgewerkt: ${new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`; }
    catch (error) { list.innerHTML = `<p class="load-error">${errorMessage(error)}</p>`; }
  }
  function initAdmin() {
    const loginView = document.getElementById('loginView'), adminView = document.getElementById('adminView');
    const showAdmin = async () => { loginView.hidden = true; adminView.hidden = false; await renderAdmin(); };
    if (token()) showAdmin();
    document.getElementById('loginForm').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), error = document.getElementById('loginError'); error.hidden = true; try { const login = await api('/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }); sessionStorage.setItem('wikel-token', login.token); showAdmin(); } catch (reason) { error.hidden = false; error.textContent = reason.message; } });
    document.getElementById('logoutButton').addEventListener('click', async () => { try { await api('/logout', { method: 'POST' }); } finally { sessionStorage.removeItem('wikel-token'); location.reload(); } });
    const dialog = document.getElementById('productDialog'); document.getElementById('newProductButton').addEventListener('click', () => dialog.showModal()); document.getElementById('closeDialog').addEventListener('click', () => dialog.close());
    document.getElementById('productForm').addEventListener('submit', async event => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); form.stock = Number(form.stock); try { await api('/products', { method: 'POST', body: JSON.stringify(form) }); event.currentTarget.reset(); dialog.close(); renderAdmin(); } catch (error) { alert(error.message); } });
  }
  async function renderAdmin() {
    const container = document.getElementById('adminProducts'); if (!container) return;
    try { const products = await api('/products'); container.innerHTML = products.map(product => { const [label, state] = statusFor(product); return `<article class="admin-product" data-id="${product.id}" data-stock="${product.stock}"><div class="product-icon" aria-hidden="true">${product.icon || '•'}</div><div class="admin-product-info"><h2>${escapeHtml(product.name)}</h2><p class="status ${state}"><span></span>${label}</p></div><div class="stepper"><button type="button" data-action="decrease" aria-label="Verminder ${escapeHtml(product.name)}">−</button><input class="stock-input" data-action="set" aria-label="Stel voorraad van ${escapeHtml(product.name)} in" type="number" min="0" max="9999" value="${product.stock}" /><button type="button" data-action="increase" aria-label="Verhoog ${escapeHtml(product.name)}">+</button></div><label class="availability"><input type="checkbox" data-action="toggle" ${product.active ? 'checked' : ''} /><span></span>Beschikbaar</label></article>`; }).join(''); container.querySelectorAll('button[data-action], input[data-action]').forEach(control => control.addEventListener(control.dataset.action === 'set' ? 'change' : 'click', async () => { const card = control.closest('.admin-product'), value = Number(control.value), patch = control.dataset.action === 'toggle' ? { active: control.checked } : control.dataset.action === 'set' ? { stock: value } : { stock: Math.max(0, Number(card.dataset.stock) + (control.dataset.action === 'increase' ? 1 : -1)) }; try { await api(`/products/${card.dataset.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); renderAdmin(); } catch (error) { alert(error.message); renderAdmin(); } })); }
    catch (error) { container.innerHTML = `<p class="load-error">${errorMessage(error)}</p>`; }
  }
  window.Wikel = { renderPublic, initAdmin };
  if (document.getElementById('productList')) setInterval(() => location.reload(), 60000);
})();
