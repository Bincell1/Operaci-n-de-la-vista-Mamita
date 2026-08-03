/**
 * JUNTOS POR MAMITA - L\u00d3GICA DE NEGOCIO Y RENDERIZADO
 * Aplicaci\u00f3n del lado del cliente que sincroniza datos con Supabase.
 * Implementa persistencia compartida en la nube, suscripciones en tiempo
 * real, gr\u00e1ficos SVG din\u00e1micos y un term\u00f3metro l\u00edquido interactivo.
 *
 * IMPORTANTE: Cada donante ahora se identifica con un `id` (UUID) que
 * viene de Supabase. Ya NO se usan \u00edndices de array para editar/
 * eliminar. Esto evita errores cuando varios usuarios escriben a la vez.
 */

// ==========================================================================
// ESTADO GLOBAL DE LA APLICACI\u00d3N
// ==========================================================================
let state = {
    goal: 3000.00,
    donors: [], // { id: string, name: string, amount: number, date: string }
    isAdmin: false,
    adminPin: 'Mamita8080', // PIN por defecto (se sobreescribe desde Supabase)
    isLoaded: false, // Controla la animaci\u00f3n de entrada del term\u00f3metro
    isLoading: true, // Indica si estamos cargando datos del backend
    supabaseReady: false // True cuando Supabase est\u00e1 configurado y conectado
};

// Paleta de colores premium para los segmentos de la gráfica circular
const CHART_COLORS = [
    '#6366f1', // Indigo
    '#ec4899', // Rosa
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#14b8a6', // Teal
    '#f97316', // Orange
    '#3b82f6', // Azul
    '#a855f7'  // Púrpura
];

// ==========================================================================
// INICIALIZACIÓN
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();

    // Intentamos Supabase primero. Si no está configurado, fallback a LocalStorage.
    if (isSupabaseConfigured()) {
        initSupabase();
        state.supabaseReady = true;
        await loadStateFromSupabase();
        subscribeToSupabaseChanges();
    } else {
        console.warn(
            'Supabase no configurado. Edita supabase-config.js para añadir tu URL y anon key. ' +
            'Mientras tanto, la app cae a LocalStorage (los cambios no se comparten entre usuarios).'
        );
        loadStateFromLocalStorage();
    }

    // Renderizamos directamente con el nivel real de progreso
    state.isLoaded = true;
    state.isLoading = false;
    renderApp();

    // El enlace "#data=..." ya no es necesario (los datos viven en el backend),
    // pero lo revisamos por compatibilidad con enlaces viejos (legacy).
    checkUrlForSharedData();
});

// ==========================================================================
// CARGA Y GUARDADO DE DATOS DESDE/HAcia SUPABASE
// ==========================================================================

// Carga el estado desde Supabase (donantes + settings en una sola fila)
async function loadStateFromSupabase() {
    try {
        const sb = initSupabase();

        // Carga settings (meta y pin). Fila única (id=1).
        const { data: settings, error: sErr } = await sb
            .from(SETTINGS_TABLE)
            .select('goal, admin_pin')
            .eq('id', 1)
            .maybeSingle();
        if (sErr) throw sErr;
        if (settings) {
            state.goal = parseFloat(settings.goal) || 3000.00;
            if (settings.admin_pin === 'Abuela8080') {
                state.adminPin = 'Mamita8080';
                await saveSettingsToSupabase(state.goal, 'Mamita8080');
            } else {
                state.adminPin = settings.admin_pin || 'Mamita8080';
            }
        }

        // Carga donantes ordenados por fecha descendente.
        const { data: donors, error: dErr } = await sb
            .from(DONORS_TABLE)
            .select('id, name, amount, date')
            .order('date', { ascending: false });
        if (dErr) throw dErr;

        state.donors = (donors || []).map(d => ({
            id: d.id,
            name: d.name,
            amount: parseFloat(d.amount) || 0,
            date: d.date
        }));
    } catch (e) {
        console.error('Error al cargar datos desde Supabase:', e);
        showToast('No se pudieron cargar los datos desde el servidor.', 'error');
        loadStateFromLocalStorage();
    }
}

// Guarda la fila única de settings (meta y pin)
async function saveSettingsToSupabase(newGoal, newPin) {
    try {
        const sb = initSupabase();
        const { error } = await sb
            .from(SETTINGS_TABLE)
            .upsert({
                id: 1,
                goal: newGoal,
                admin_pin: newPin,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
        if (error) throw error;
    } catch (e) {
        console.error('Error al guardar settings en Supabase:', e);
        showToast('No se pudo guardar la meta/PIN en el servidor.', 'error');
    }
}

// ===== Suscripción en tiempo real (Realtime de Supabase) ============
// Cada vez que alguien hace un cambio en la tabla de donantes o settings,
// todas las pestañas abiertas reciben el evento y se refrescan solas.
let realtimeStarted = false;
function subscribeToSupabaseChanges() {
    if (realtimeStarted) return;
    realtimeStarted = true;
    const sb = initSupabase();

    sb.channel('mamita-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: DONORS_TABLE },
            () => refreshDonorsFromSupabase()
        )
        .on('postgres_changes',
            { event: '*', schema: 'public', table: SETTINGS_TABLE },
            () => refreshSettingsFromSupabase()
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Suscripción en tiempo real activa.');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('Error en la suscripción de tiempo real:', status);
            }
        });
}

// Recarga solo donantes desde el servidor (usado por realtime)
async function refreshDonorsFromSupabase() {
    try {
        const sb = initSupabase();
        const { data, error } = await sb
            .from(DONORS_TABLE)
            .select('id, name, amount, date')
            .order('date', { ascending: false });
        if (error) throw error;
        state.donors = (data || []).map(d => ({
            id: d.id,
            name: d.name,
            amount: parseFloat(d.amount) || 0,
            date: d.date
        }));
        renderApp();
    } catch (e) {
        console.error('Error al refrescar donantes:', e);
    }
}

// Recarga solo settings desde el servidor (usado por realtime)
async function refreshSettingsFromSupabase() {
    try {
        const sb = initSupabase();
        const { data, error } = await sb
            .from(SETTINGS_TABLE)
            .select('goal, admin_pin')
            .eq('id', 1)
            .maybeSingle();
        if (error) throw error;
        if (data) {
            state.goal = parseFloat(data.goal) || state.goal;
            state.adminPin = data.admin_pin || state.adminPin;
            renderApp();
        }
    } catch (e) {
        console.error('Error al refrescar settings:', e);
    }
}

// ==========================================================================
// FALLBACK EN LOCALSTORAGE (solo si no hay Supabase configurado)
// ==========================================================================

function loadStateFromLocalStorage() {
    const savedDonors = localStorage.getItem('mamita_donors');
    const savedGoal = localStorage.getItem('mamita_goal');
    const savedPin = localStorage.getItem('mamita_pin');

    if (savedDonors) {
        try {
            const parsed = JSON.parse(savedDonors);
            state.donors = parsed.map(d => ({
                id: d.id || ('local_' + Math.random().toString(36).slice(2)),
                name: d.name,
                amount: parseFloat(d.amount) || 0,
                date: d.date || new Date().toISOString()
            }));
        } catch (e) {
            console.error('Error al cargar donantes de LocalStorage', e);
            state.donors = [];
        }
    }
    if (savedGoal) state.goal = parseFloat(savedGoal) || 3000.00;
    if (savedPin) {
        if (savedPin === 'Abuela8080') {
            state.adminPin = 'Mamita8080';
            localStorage.setItem('mamita_pin', 'Mamita8080');
        } else {
            state.adminPin = savedPin;
        }
    }
}

function saveStateToLocalStorage() {
    const lean = state.donors.map(d => ({
        name: d.name, amount: d.amount, date: d.date
    }));
    localStorage.setItem('mamita_donors', JSON.stringify(lean));
    localStorage.setItem('mamita_goal', state.goal.toString());
    localStorage.setItem('mamita_pin', state.adminPin);
}

// Verifica si la URL tiene datos compartidos codificados (LEGACY).
// En modo Supabase esta función ya no sobreescribe el estado porque los
// datos "de verdad" viven en el backend. Solo se usa como fallback offline.
function checkUrlForSharedData() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#data=')) return;

    // En modo Supabase, simplemente limpiamos el hash viejo y avisamos.
    if (state.supabaseReady) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        showToast('Los datos se cargan automáticamente desde el servidor.', 'info');
        return;
    }

    const base64Data = hash.substring(6);
    try {
        const jsonString = decodeURIComponent(escape(atob(base64Data)));
        const decodedData = JSON.parse(jsonString);

        if (decodedData.donors && Array.isArray(decodedData.donors)) {
            state.donors = decodedData.donors.map(d => ({
                id: d.id || ('local_' + Math.random().toString(36).slice(2)),
                name: d.name,
                amount: parseFloat(d.amount) || 0,
                date: d.date || new Date().toISOString()
            }));
            state.goal = parseFloat(decodedData.goal) || 3000.00;

            showToast('Datos cargados desde el enlace compartido (modo offline).', 'success');
            renderApp();
        }
    } catch (e) {
        console.error('Error al decodificar datos de la URL:', e);
        showToast('El enlace compartido no es válido o está corrupto.', 'error');
    }
}

// Genera y copia el enlace para compartir la información actual
function generateShareLink() {
    try {
        // En modo Supabase, basta con compartir la URL limpia: todos ven lo
        // mismo porque los datos viven en el backend.
        if (state.supabaseReady) {
            const cleanUrl = window.location.origin + window.location.pathname;
            navigator.clipboard.writeText(cleanUrl).then(() => {
                showToast('¡Enlace copiado! Cualquiera que lo abra verá los donantes actualizados.', 'success');
            }).catch(err => {
                console.error('Error al copiar enlace:', err);
                showToast('No se pudo copiar el enlace. Cópielo manualmente: ' + cleanUrl, 'error');
            });
            return;
        }

        // Modo fallback (LocalStorage): codifica todo en Base64 como antes.
        const dataToEncode = {
            goal: state.goal,
            donors: state.donors.map(d => ({ name: d.name, amount: d.amount, date: d.date }))
        };
        const jsonString = JSON.stringify(dataToEncode);
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
        const baseUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${baseUrl}#data=${base64Data}`;

        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('¡Enlace copiado al portapapeles! Compártelo con los donantes.', 'success');
        }).catch(err => {
            console.error('Error al copiar enlace:', err);
            const inputTemp = document.createElement('input');
            inputTemp.value = shareUrl;
            document.body.appendChild(inputTemp);
            inputTemp.select();
            document.execCommand('copy');
            document.body.removeChild(inputTemp);
            showToast('¡Enlace copiado al portapapeles! (Fallback)', 'success');
        });
    } catch (e) {
        console.error('Error al generar enlace compartible:', e);
        showToast('No se pudo generar el enlace de compartición.', 'error');
    }
}

// ==========================================================================
// LÓGICA DE NEGOCIO (AGREGAR, EDITAR, SUMAR Y ELIMINAR DONANTES)
// ==========================================================================
// En modo Supabase, cada operación hace INSERT/UPDATE/DELETE en la nube.
// El refresco visual lo dispara la suscripción en tiempo real (refreshDonorsFromSupabase),
// pero hacemos un render local optimista para que la UI se vea fluida.

/**
 * Agrega una nueva donación o suma a una existente.
 * @param {string} name - Nombre del donante
 * @param {number} amount - Cantidad donada
 */
async function handleAddOrUpdateDonation(name, amount) {
    name = name.trim();
    if (!name || isNaN(amount) || amount <= 0) return;

    // Buscar si el donante ya existe (sin importar mayúsculas/minúsculas y espacios)
    const existingDonor = state.donors.find(
        d => d.name.toLowerCase().replace(/\s+/g, '') === name.toLowerCase().replace(/\s+/g, '')
    );

    if (existingDonor) {
        if (state.supabaseReady && existingDonor.id) {
            const newAmount = (parseFloat(existingDonor.amount) || 0) + amount;
            const { error } = await initSupabase()
                .from(DONORS_TABLE)
                .update({
                    amount: newAmount,
                    date: new Date().toISOString()
                })
                .eq('id', existingDonor.id);
            if (error) {
                console.error('Error al sumar en Supabase:', error);
                showToast('No se pudo actualizar el donante en el servidor.', 'error');
                return;
            }
            // Actualiza localmente para visual inmediato (realtime confirmará)
            existingDonor.amount = newAmount;
            existingDonor.date = new Date().toISOString();
        } else {
            existingDonor.amount += amount;
            existingDonor.date = new Date().toISOString();
            saveStateToLocalStorage();
        }
        showToast(`Se han sumado $${amount.toFixed(2)} a ${existingDonor.name}. Nuevo total: $${existingDonor.amount.toFixed(2)}`, 'success');
        renderApp();
    } else {
        // Nuevo donante
        const newDate = new Date().toISOString();
        if (state.supabaseReady) {
            const { data, error } = await initSupabase()
                .from(DONORS_TABLE)
                .insert([{ name: name, amount: amount, date: newDate }])
                .select('id');
            if (error) {
                console.error('Error al insertar donante en Supabase:', error);
                showToast('No se pudo registrar el donante en el servidor.', 'error');
                return;
            }
            state.donors.unshift({
                id: data[0].id, name: name, amount: amount, date: newDate
            });
        } else {
            state.donors.push({
                id: 'local_' + Math.random().toString(36).slice(2),
                name: name, amount: amount, date: newDate
            });
            saveStateToLocalStorage();
        }
        showToast(`Se ha registrado la donación de ${name} por $${amount.toFixed(2)}`, 'success');
        renderApp();
    }
}

/**
 * Añade fondos de manera rápida a un donante específico por su id (UUID).
 * @param {string} donorId - id del donante (UUID en Supabase)
 * @param {number} extraAmount - Cantidad extra a sumar
 */
async function quickAddFunds(donorId, extraAmount) {
    const donor = state.donors.find(d => d.id === donorId);
    if (!donor || isNaN(extraAmount) || extraAmount <= 0) return;

    const newAmount = (parseFloat(donor.amount) || 0) + extraAmount;
    const newDate = new Date().toISOString();

    if (state.supabaseReady) {
        const { error } = await initSupabase()
            .from(DONORS_TABLE)
            .update({ amount: newAmount, date: newDate })
            .eq('id', donor.id);
        if (error) {
            console.error('Error al sumar fondos en Supabase:', error);
            showToast('No se pudo añadir el dinero en el servidor.', 'error');
            return;
        }
    } else {
        saveStateToLocalStorage();
    }
    donor.amount = newAmount;
    donor.date = newDate;
    showToast(`Se sumaron $${extraAmount.toFixed(2)} a ${donor.name}. Total: $${donor.amount.toFixed(2)}`, 'success');
    renderApp();
}

/**
 * Elimina una donación por id (UUID).
 * @param {string} donorId - id del donante
 */
async function deleteDonation(donorId) {
    const donor = state.donors.find(d => d.id === donorId);
    if (!donor) return;

    if (state.supabaseReady) {
        const { error } = await initSupabase()
            .from(DONORS_TABLE)
            .delete()
            .eq('id', donor.id);
        if (error) {
            console.error('Error al eliminar en Supabase:', error);
            showToast('No se pudo eliminar el donante del servidor.', 'error');
            return;
        }
    }
    state.donors = state.donors.filter(d => d.id !== donorId);
    if (!state.supabaseReady) saveStateToLocalStorage();
    showToast(`Se eliminó el registro de donaciones de ${donor.name}`, 'info');
    renderApp();
}

/**
 * Modifica la meta de recaudación
 * @param {number} newGoal - Nuevo monto meta
 */
async function updateGoal(newGoal) {
    if (isNaN(newGoal) || newGoal <= 0) return;
    state.goal = newGoal;
    if (state.supabaseReady) {
        await saveSettingsToSupabase(state.goal, state.adminPin);
    } else {
        saveStateToLocalStorage();
    }
    renderApp();
    showToast(`La meta se ha ajustado a $${newGoal.toFixed(2)}`, 'success');
}

/**
 * Borra toda la base de datos de donaciones (con confirmación de seguridad)
 */
async function resetAllData() {
    if (confirm('¿Estás seguro de que deseas borrar TODAS las donaciones registradas? Esta acción no se puede deshacer.')) {
        if (state.supabaseReady) {
            // Borra todos los donantes del backend
            const { error } = await initSupabase()
                .from(DONORS_TABLE)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // truco para borrar todo
            if (error) {
                console.error('Error al borrar todos los donantes en Supabase:', error);
                showToast('No se pudieron borrar los datos del servidor.', 'error');
                return;
            }
        } else {
            saveStateToLocalStorage();
        }
        state.donors = [];
        renderApp();
        showToast('Se han eliminado todos los datos correctamente.', 'info');
    }
}

// ==========================================================================
// RENDERIZADO VISUAL Y COMPONENTES DINÁMICOS
// ==========================================================================

// Función central para actualizar toda la interfaz
function renderApp() {
    // 1. Cálculos de totales
    const totalCollected = state.donors.reduce((sum, d) => sum + d.amount, 0);
    const remaining = Math.max(0, state.goal - totalCollected);
    const progressPercent = state.goal > 0 ? (totalCollected / state.goal) * 100 : 0;

    // 2. Actualizar estadísticas de texto con formato de moneda local
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    document.getElementById('stat-collected').textContent = formatter.format(totalCollected);
    document.getElementById('stat-goal').textContent = formatter.format(state.goal);
    document.getElementById('stat-remaining').textContent = formatter.format(remaining);

    // 3. Actualizar porcentaje en la interfaz
    const roundedPercent = progressPercent % 1 === 0 ? progressPercent.toFixed(0) : progressPercent.toFixed(1);
    document.getElementById('text-percentage').textContent = `${roundedPercent}%`;

    // 4. Actualizar termómetro líquido (animación CSS a través de variable)
    // Si la app ya está cargada, actualizamos el nivel real; si no, dejamos en 0% para la animación de entrada
    const cappedPercent = Math.min(progressPercent, 100);
    if (state.isLoaded) {
        document.documentElement.style.setProperty('--progress-percent', `${cappedPercent}%`);
    }

    // Cambiar la tonalidad del líquido si llegamos a la meta (brillo dorado)
    const waveWrapper = document.getElementById('liquid-wave');
    if (progressPercent >= 100) {
        waveWrapper.style.background = 'linear-gradient(to top, #fbbf24, #f59e0b)';
        waveWrapper.style.boxShadow = '0 0 35px rgba(245, 158, 11, 0.7)';
    } else {
        waveWrapper.style.background = 'linear-gradient(to top, #ea580c, #fb923c)';
        waveWrapper.style.boxShadow = '0 0 30px rgba(249, 115, 22, 0.5)';
    }

    // 5. Renderizar lista de donantes
    renderDonorsList();

    // 6. Dibujar gráfico de donut
    renderDonutChart(totalCollected);

    // 7. Actualizar visibilidad de paneles según rol (Admin / Público)
    updateAdminViewVisibility();
}

/**
 * Renderiza la lista de tarjetas de donantes basándose en búsqueda y orden
 */
function renderDonorsList() {
    const listContainer = document.getElementById('donors-list');
    const donorsCountBadge = document.getElementById('donors-count');
    const searchVal = document.getElementById('search-donor').value.toLowerCase().trim();
    const sortBy = document.getElementById('sort-by').value;

    // Filtrar donantes por búsqueda
    let filteredDonors = state.donors.map(d => ({ ...d }));
    if (searchVal) {
        filteredDonors = filteredDonors.filter(d => d.name.toLowerCase().includes(searchVal));
    }

    // Ordenar donantes
    if (sortBy === 'recent') {
        filteredDonors.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else if (sortBy === 'amount-desc') {
        filteredDonors.sort((a, b) => b.amount - a.amount);
    } else if (sortBy === 'amount-asc') {
        filteredDonors.sort((a, b) => a.amount - b.amount);
    } else if (sortBy === 'name-asc') {
        filteredDonors.sort((a, b) => a.name.localeCompare(b.name));
    }

    donorsCountBadge.textContent = `${state.donors.length} ${state.donors.length === 1 ? 'aporte' : 'aportes'}`;

    if (filteredDonors.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${searchVal ? '🔍' : '🤝'}</div>
                <p class="empty-title">${searchVal ? 'No se encontraron donantes' : 'Aún no hay donaciones registradas'}</p>
                <p class="empty-desc">${searchVal ? 'Prueba escribiendo otro nombre en el buscador.' : 'Si eres administrador, desbloquea el panel para agregar la primera donación.'}</p>
            </div>
        `;
        return;
    }

    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    let html = '';

    filteredDonors.forEach((donor) => {
        const percentOfGoal = ((donor.amount / state.goal) * 100).toFixed(1);
        const initials = donor.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        // Seleccionar color de avatar consistente según el nombre
        const charCodeSum = donor.name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const avatarColorIndex = charCodeSum % CHART_COLORS.length;
        const avatarStyle = `background: linear-gradient(135deg, ${CHART_COLORS[avatarColorIndex]} 0%, #1e1b4b 100%)`;

        const dateObj = new Date(donor.date);
        const formattedDate = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

        // IMPORTANTE: pasamos el id (UUID string) escapado con comillas simples.
        // Ya no usamos índices numéricos porque los ids pueden cambiar tras recargas.
        const safeId = String(donor.id).replace(/'/g, "\\'");

        html += `
            <div class="donor-card" data-id="${donor.id}">
                <div class="donor-info">
                    <div class="donor-avatar" style="${avatarStyle}">${initials}</div>
                    <div class="donor-meta">
                        <h4 class="donor-name-title" title="${donor.name}">${donor.name}</h4>
                        <div class="donor-submeta">
                            <span>${formattedDate}</span>
                        </div>
                    </div>
                </div>
                
                <div class="donor-card-actions">
                    <div class="donor-amount-badge">
                        <span class="donor-amount">${formatter.format(donor.amount)}</span>
                        <span class="donor-percent-goal">${percentOfGoal}% de la meta</span>
                    </div>
                    
                    ${state.isAdmin ? `
                        <div class="admin-actions-cell">
                            <button class="btn-action btn-action-add" onclick="openQuickAddModal('${safeId}')" title="Agregar más dinero">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <button class="btn-action btn-action-edit" onclick="editDonorForm('${safeId}')" title="Editar registro">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn-action btn-action-delete" onclick="deleteDonation('${safeId}')" title="Eliminar registro">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

/**
 * Dibuja la distribución en el gráfico circular SVG (Donut Chart)
 * @param {number} totalCollected - Monto total recaudado hasta ahora
 */
function renderDonutChart(totalCollected) {
    const segmentsContainer = document.getElementById('donut-segments');
    const legendContainer = document.getElementById('chart-legend');
    const donutCountLabel = document.getElementById('donut-total-count');

    // Si no hay donaciones
    if (state.donors.length === 0 || totalCollected === 0) {
        segmentsContainer.innerHTML = '';
        legendContainer.innerHTML = '<div class="empty-state"><p class="empty-desc">Sin datos de distribución que mostrar.</p></div>';
        donutCountLabel.textContent = '0';
        return;
    }

    donutCountLabel.textContent = state.donors.length.toString();

    // Ordenar los donantes de mayor a menor para la gráfica
    const sortedDonors = [...state.donors].sort((a, b) => b.amount - a.amount);

    // Radio del círculo SVG es r=80, circunferencia C = 2 * PI * r = 502.65
    const R = 80;
    const C = 2 * Math.PI * R;

    let currentOffset = 0;
    let segmentsHtml = '';
    let legendHtml = '';

    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    // Si hay más de 6 donantes, agrupamos los más pequeños en "Otros" para no saturar el gráfico
    let displayDonors = [];
    if (sortedDonors.length <= 6) {
        displayDonors = sortedDonors.map((d, i) => ({ ...d, color: CHART_COLORS[i % CHART_COLORS.length] }));
    } else {
        // Tomar los 5 más grandes
        for (let i = 0; i < 5; i++) {
            displayDonors.push({
                ...sortedDonors[i],
                color: CHART_COLORS[i % CHART_COLORS.length]
            });
        }
        // Agrupar el resto en "Otros"
        const othersAmount = sortedDonors.slice(5).reduce((sum, d) => sum + d.amount, 0);
        if (othersAmount > 0) {
            displayDonors.push({
                name: 'Otros donantes',
                amount: othersAmount,
                color: '#6b7280' // Gris neutro
            });
        }
    }

    displayDonors.forEach((donor) => {
        const shareOfTotal = donor.amount / totalCollected;
        const segmentLength = shareOfTotal * C;
        const strokeDashOffset = C - segmentLength;
        const percentOfTotal = (shareOfTotal * 100).toFixed(1);
        const percentOfGoal = ((donor.amount / state.goal) * 100).toFixed(1);

        // Segmento del donut (círculo SVG)
        segmentsHtml += `
            <circle class="donut-segment" 
                    cx="100" 
                    cy="100" 
                    r="${R}"
                    stroke="${donor.color}" 
                    stroke-dasharray="${segmentLength} ${C - segmentLength}"
                    stroke-dashoffset="${-currentOffset}"
                    title="${donor.name}: ${percentOfTotal}% de las donaciones">
            </circle>
        `;

        // Item de Leyenda interactiva
        legendHtml += `
            <div class="legend-item" title="${donor.name} aportó ${formatter.format(donor.amount)}">
                <div class="legend-left">
                    <span class="legend-color" style="background-color: ${donor.color}"></span>
                    <span class="legend-name">${donor.name}</span>
                </div>
                <div class="legend-right">
                    <span>${formatter.format(donor.amount)}</span>
                    <span class="legend-percentage">${percentOfGoal}% meta</span>
                </div>
            </div>
        `;

        currentOffset += segmentLength;
    });

    segmentsContainer.innerHTML = segmentsHtml;
    legendContainer.innerHTML = legendHtml;
}

/**
 * Actualiza la visibilidad de los controles administrativos según el rol
 */
function updateAdminViewVisibility() {
    const adminPanel = document.getElementById('admin-panel');
    const adminToggleBtn = document.getElementById('btn-admin-toggle');
    const adminStatusText = document.getElementById('admin-status-text');

    if (state.isAdmin) {
        adminPanel.classList.remove('hidden');
        adminToggleBtn.classList.add('btn-secondary');
        adminToggleBtn.classList.remove('btn-primary');
        adminToggleBtn.style.borderColor = 'var(--color-secondary)';
        adminStatusText.textContent = 'Salir Admin';
        // Icono candado abierto
        adminToggleBtn.querySelector('svg').innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>';
    } else {
        adminPanel.classList.add('hidden');
        adminToggleBtn.classList.remove('btn-secondary');
        adminToggleBtn.classList.add('btn-primary');
        adminToggleBtn.style.borderColor = 'transparent';
        adminStatusText.textContent = 'Administrador';
        // Icono candado cerrado
        adminToggleBtn.querySelector('svg').innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
    }
}

// ==========================================================================
// CONTROLADORES DE EVENTOS (EVENT LISTENERS)
// ==========================================================================
function setupEventListeners() {
    // 1. Buscador y ordenamiento
    document.getElementById('search-donor').addEventListener('input', renderDonorsList);
    document.getElementById('sort-by').addEventListener('change', renderDonorsList);

    // 2. Modos e Interfaz del Header
    document.getElementById('btn-admin-toggle').addEventListener('click', toggleAdminMode);
    document.getElementById('btn-share-link').addEventListener('click', generateShareLink);

    // 3. Panel de Administrador - Guardar donación
    document.getElementById('form-donation').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('edit-donor-index').value;
        const nameInput = document.getElementById('input-donor-name');
        const amountInput = document.getElementById('input-amount');

        const name = nameInput.value;
        const amount = parseFloat(amountInput.value);

        if (editId !== '') {
            // Caso Edición Directa completa de un registro (por id UUID)
            const donor = state.donors.find(d => d.id === editId);
            if (!donor) {
                showToast('No se encontró el donante a editar. Puede que fue borrado.', 'error');
                document.getElementById('edit-donor-index').value = '';
                document.getElementById('btn-submit-text').textContent = 'Guardar Donación';
                document.getElementById('btn-cancel-edit').classList.add('hidden');
                e.target.reset();
                return;
            }
            const originalName = donor.name;
            donor.name = name.trim();
            donor.amount = amount;
            donor.date = new Date().toISOString();

            if (state.supabaseReady) {
                const { error } = await initSupabase()
                    .from(DONORS_TABLE)
                    .update({ name: donor.name, amount: donor.amount, date: donor.date })
                    .eq('id', donor.id);
                if (error) {
                    console.error('Error al editar donante en Supabase:', error);
                    showToast('No se pudo guardar el cambio en el servidor.', 'error');
                } else {
                    showToast(`Se ha modificado el registro de ${originalName}`, 'success');
                }
            } else {
                saveStateToLocalStorage();
                showToast(`Se ha modificado el registro de ${originalName}`, 'success');
            }

            // Limpiar modo edición
            document.getElementById('edit-donor-index').value = '';
            document.getElementById('btn-submit-text').textContent = 'Guardar Donación';
            document.getElementById('btn-cancel-edit').classList.add('hidden');

            renderApp();
        } else {
            // Caso Registro/Suma Normal
            await handleAddOrUpdateDonation(name, amount);
        }

        e.target.reset();
        document.getElementById('donor-suggestions').classList.add('hidden');
    });

    // 4. Cancelar edición
    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        const form = document.getElementById('form-donation');
        form.reset();
        document.getElementById('edit-donor-index').value = '';
        document.getElementById('btn-submit-text').textContent = 'Guardar Donación';
        document.getElementById('btn-cancel-edit').classList.add('hidden');
        document.getElementById('donor-suggestions').classList.add('hidden');
        showToast('Edición cancelada.', 'info');
    });

    // Autocompletado / Sugerencias de donantes existentes al escribir
    document.getElementById('input-donor-name').addEventListener('input', handleNameInputSuggestions);

    // 5. Botones de acción avanzada
    document.getElementById('btn-admin-close').addEventListener('click', () => {
        state.isAdmin = false;
        renderApp();
        showToast('Modo administrador cerrado.', 'info');
    });

    document.getElementById('btn-edit-goal').addEventListener('click', () => {
        document.getElementById('input-goal').value = state.goal;
        openModal('modal-goal');
    });

    document.getElementById('btn-reset-data').addEventListener('click', resetAllData);

    document.getElementById('btn-change-pin').addEventListener('click', () => {
        document.getElementById('input-new-pin').value = '';
        document.getElementById('input-confirm-pin').value = '';
        document.getElementById('change-pin-error').classList.add('hidden');
        openModal('modal-change-pin');
        document.getElementById('input-new-pin').focus();
    });

    document.getElementById('btn-close-change-pin-modal').addEventListener('click', () => closeModal('modal-change-pin'));
    document.getElementById('btn-cancel-change-pin').addEventListener('click', () => closeModal('modal-change-pin'));
    document.getElementById('btn-confirm-change-pin').addEventListener('click', handleChangePin);
    document.getElementById('input-confirm-pin').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChangePin();
    });

    // 6. Modal de PIN
    document.getElementById('btn-close-pin-modal').addEventListener('click', () => closeModal('modal-pin'));
    document.getElementById('btn-cancel-pin').addEventListener('click', () => closeModal('modal-pin'));
    document.getElementById('btn-confirm-pin').addEventListener('click', verifyAdminPin);
    document.getElementById('input-pin').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyAdminPin();
    });

    // 7. Modal de Ajustar Meta
    document.getElementById('btn-close-goal-modal').addEventListener('click', () => closeModal('modal-goal'));
    document.getElementById('btn-cancel-goal').addEventListener('click', () => closeModal('modal-goal'));
    document.getElementById('btn-confirm-goal').addEventListener('click', () => {
        const newGoal = parseFloat(document.getElementById('input-goal').value);
        if (newGoal > 0) {
            updateGoal(newGoal);
            closeModal('modal-goal');
        } else {
            showToast('Por favor introduce una meta válida mayor a 0.', 'error');
        }
    });

    // 8. Modal de Añadir Dinero Rápido
    document.getElementById('btn-close-funds-modal').addEventListener('click', () => closeModal('modal-add-funds'));
    document.getElementById('btn-cancel-funds').addEventListener('click', () => closeModal('modal-add-funds'));
    document.getElementById('btn-confirm-funds').addEventListener('click', handleQuickFundsSubmit);
    document.getElementById('input-quick-amount').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleQuickFundsSubmit();
    });
}

// Toggles el modo de administrador con PIN si se activa
function toggleAdminMode() {
    if (state.isAdmin) {
        state.isAdmin = false;
        renderApp();
        showToast('Modo de edición desactivado.', 'info');
    } else {
        // Habilitar modal para ingresar PIN
        document.getElementById('input-pin').value = '';
        document.getElementById('pin-error').classList.add('hidden');
        openModal('modal-pin');
        document.getElementById('input-pin').focus();
    }
}

// Verifica el PIN introducido
function verifyAdminPin() {
    const pinVal = document.getElementById('input-pin').value;
    if (pinVal === state.adminPin) {
        state.isAdmin = true;
        closeModal('modal-pin');
        renderApp();
        showToast('¡Acceso concedido! Modo Administrador activado.', 'success');

        // Scroll suave al panel de admin para mejorar UX en móviles
        setTimeout(() => {
            document.getElementById('admin-panel').scrollIntoView({ behavior: 'smooth' });
        }, 300);
    } else {
        document.getElementById('pin-error').classList.remove('hidden');
        showToast('PIN incorrecto. Intenta de nuevo.', 'error');
    }
}

// Cambia el PIN de administrador
async function handleChangePin() {
    const newPin = document.getElementById('input-new-pin').value;
    const confirmPin = document.getElementById('input-confirm-pin').value;
    const errorEl = document.getElementById('change-pin-error');

    if (!newPin) {
        errorEl.textContent = 'El nuevo PIN no puede estar vacío.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (newPin.length < 4) {
        errorEl.textContent = 'El PIN debe tener al menos 4 caracteres.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (newPin !== confirmPin) {
        errorEl.textContent = 'Los códigos PIN no coinciden. Intenta de nuevo.';
        errorEl.classList.remove('hidden');
        return;
    }

    state.adminPin = newPin;
    if (state.supabaseReady) {
        await saveSettingsToSupabase(state.goal, newPin);
    } else {
        saveStateToLocalStorage();
    }
    closeModal('modal-change-pin');
    showToast('¡El código PIN ha sido cambiado con éxito!', 'success');
}

// Abre un modal con animación suave
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

// Cierra un modal
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Rellena el formulario con los datos de un donante para edición directa
function editDonorForm(donorId) {
    const donor = state.donors.find(d => d.id === donorId);
    if (!donor) return;

    document.getElementById('input-donor-name').value = donor.name;
    document.getElementById('input-amount').value = donor.amount;
    document.getElementById('edit-donor-index').value = donor.id;

    document.getElementById('btn-submit-text').textContent = 'Actualizar Registro';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');

    showToast(`Editando a ${donor.name}. Modifica el formulario y presiona Guardar.`, 'info');
    document.getElementById('input-donor-name').focus();
}

// Abre el modal rápido para añadir más dinero a un donante específico
function openQuickAddModal(donorId) {
    const donor = state.donors.find(d => d.id === donorId);
    if (!donor) return;

    document.getElementById('quick-donor-index').value = donor.id;
    document.getElementById('quick-donor-name').textContent = donor.name;

    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    document.getElementById('quick-donor-current').textContent = formatter.format(donor.amount);

    document.getElementById('input-quick-amount').value = '';

    openModal('modal-add-funds');

    setTimeout(() => {
        document.getElementById('input-quick-amount').focus();
    }, 100);
}

// Envía la suma rápida del modal
async function handleQuickFundsSubmit() {
    const donorId = document.getElementById('quick-donor-index').value;
    const amount = parseFloat(document.getElementById('input-quick-amount').value);

    if (amount > 0) {
        await quickAddFunds(donorId, amount);
        closeModal('modal-add-funds');
    } else {
        showToast('El monto introducido debe ser mayor que 0.', 'error');
    }
}

// Maneja la autocompletación y sugerencias de nombres mientras se escribe
function handleNameInputSuggestions(e) {
    const val = e.target.value.toLowerCase().trim();
    const suggestionsBox = document.getElementById('donor-suggestions');

    if (val.length < 1) {
        suggestionsBox.classList.add('hidden');
        return;
    }

    // Encontrar donantes existentes que coincidan con la búsqueda
    const matches = state.donors.filter(d => d.name.toLowerCase().includes(val));

    if (matches.length === 0) {
        suggestionsBox.classList.add('hidden');
        return;
    }

    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    let html = '';

    // Mostrar máximo 4 sugerencias
    matches.slice(0, 4).forEach(match => {
        html += `
            <div class="suggestion-item" onclick="selectSuggestion('${match.name.replace(/'/g, "\\'")}')">
                <span class="suggestion-name">${match.name}</span>
                <span class="suggestion-badge" title="Ya ha aportado esta cantidad anteriormente">${formatter.format(match.amount)}</span>
            </div>
        `;
    });

    suggestionsBox.innerHTML = html;
    suggestionsBox.classList.remove('hidden');
}

// Rellena el input de nombre al hacer clic en una sugerencia
function selectSuggestion(name) {
    document.getElementById('input-donor-name').value = name;
    document.getElementById('donor-suggestions').classList.add('hidden');

    // Enfocar el campo de monto para mayor comodidad del usuario
    document.getElementById('input-amount').focus();
    showToast(`Donante seleccionado: ${name}. Si guardas la donación, se sumará a su saldo anterior.`, 'info');
}

// ==========================================================================
// TOAST NOTIFICATIONS (NOTIFICACIONES DE SISTEMA FLOTANTES)
// ==========================================================================
/**
 * Crea e inserta una notificación emergente en la UI
 * @param {string} message - Texto a mostrar
 * @param {string} type - Tipo de notificación ('success', 'info', 'error')
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✨';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Remoción automática tras 3.5 segundos con animación suave
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px) scale(0.95)';
        setTimeout(() => {
            container.removeChild(toast);
        }, 200);
    }, 3500);
}
