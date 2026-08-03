/**
 * JUNTOS POR MAMITA - LOGICA DE NEGOCIO Y RENDERIZADO
 * Aplicación del lado del cliente para gestionar donaciones.
 * Implementa LocalStorage, compartición mediante URL Base64,
 * gráficos SVG dinámicos y un termómetro líquido interactivo.
 */

// ==========================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================================================
let state = {
    goal: 3000.00,
    donors: [], // { name: string, amount: number, date: string }
    isAdmin: false,
    adminPin: 'Mamita8080', // PIN por defecto
    isLoaded: false // Controla la animación de entrada del termómetro
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
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    setupEventListeners();

    // Renderizamos directamente con el nivel real de progreso
    state.isLoaded = true;
    renderApp();
    checkUrlForSharedData();
});

// ==========================================================================
// MANEJO DE DATOS Y COMPARTICIÓN (LOCALSTORAGE Y URL HASH)
// ==========================================================================

// Carga el estado inicial desde LocalStorage
function loadState() {
    const savedDonors = localStorage.getItem('mamita_donors');
    const savedGoal = localStorage.getItem('mamita_goal');
    const savedPin = localStorage.getItem('mamita_pin');

    if (savedDonors) {
        try {
            state.donors = JSON.parse(savedDonors);
        } catch (e) {
            console.error('Error al cargar donantes de LocalStorage', e);
            state.donors = [];
        }
    }
    if (savedGoal) {
        state.goal = parseFloat(savedGoal) || 3000.00;
    }
    if (savedPin) {
        if (savedPin === 'Abuela8080') {
            state.adminPin = 'Mamita8080';
            localStorage.setItem('mamita_pin', 'Mamita8080');
        } else {
            state.adminPin = savedPin;
        }
    }
}

// Guarda el estado actual en LocalStorage
function saveStateToLocalStorage() {
    localStorage.setItem('mamita_donors', JSON.stringify(state.donors));
    localStorage.setItem('mamita_goal', state.goal.toString());
    localStorage.setItem('mamita_pin', state.adminPin);
}

// Verifica si la URL tiene datos compartidos codificados
function checkUrlForSharedData() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#data=')) {
        const base64Data = hash.substring(6);
        try {
            // Decodifica Base64 manejando caracteres especiales utf-8 de forma segura
            const jsonString = decodeURIComponent(escape(atob(base64Data)));
            const decodedData = JSON.parse(jsonString);

            if (decodedData.donors && Array.isArray(decodedData.donors)) {
                state.donors = decodedData.donors;
                state.goal = parseFloat(decodedData.goal) || 3000.00;

                showToast('Datos cargados correctamente desde el enlace compartido.', 'success');
                renderApp();

                // Si la información es diferente de lo que tenemos localmente,
                // avisamos que pueden guardar estos datos localmente si entran en modo administrador
                const localDonors = localStorage.getItem('mamita_donors');
                if (localDonors && localDonors !== JSON.stringify(state.donors)) {
                    showToast('Estás viendo una versión compartida. Los cambios que hagas no afectarán tu base de datos local a menos que la guardes.', 'info');
                }
            }
        } catch (e) {
            console.error('Error al decodificar datos de la URL:', e);
            showToast('El enlace compartido no es válido o está corrupto.', 'error');
        }
    }
}

// Genera y copia el enlace para compartir la información actual
function generateShareLink() {
    try {
        const dataToEncode = {
            goal: state.goal,
            donors: state.donors
        };
        // Codifica a Base64 manejando caracteres especiales utf-8 de forma segura
        const jsonString = JSON.stringify(dataToEncode);
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

        // Crea la URL limpia sin otros hashes
        const baseUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${baseUrl}#data=${base64Data}`;

        // Copia al portapapeles
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('¡Enlace copiado al portapapeles! Compártelo con los donantes.', 'success');
        }).catch(err => {
            console.error('Error al copiar enlace:', err);
            // Fallback si no funciona el portapapeles directo (p.ej. navegadores antiguos)
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
// LOGICA DE NEGOCIO (AGREGAR, EDITAR, SUMAR Y ELIMINAR DONANTES)
// ==========================================================================

/**
 * Agrega una nueva donación o suma a una existente.
 * @param {string} name - Nombre del donante
 * @param {number} amount - Cantidad donada
 */
function handleAddOrUpdateDonation(name, amount) {
    name = name.trim();
    if (!name || isNaN(amount) || amount <= 0) return;

    // Buscar si el donante ya existe (sin importar mayúsculas/minúsculas y espacios extra)
    const existingDonorIndex = state.donors.findIndex(
        d => d.name.toLowerCase().replace(/\s+/g, '') === name.toLowerCase().replace(/\s+/g, '')
    );

    if (existingDonorIndex !== -1) {
        // El donante ya existe. Sumar cantidad
        const originalAmount = state.donors[existingDonorIndex].amount;
        state.donors[existingDonorIndex].amount += amount;
        state.donors[existingDonorIndex].date = new Date().toISOString(); // Actualiza fecha de última aportación

        showToast(`Se han sumado $${amount.toFixed(2)} a ${state.donors[existingDonorIndex].name}. Nuevo total: $${state.donors[existingDonorIndex].amount.toFixed(2)}`, 'success');
    } else {
        // Nuevo donante
        state.donors.push({
            name: name,
            amount: amount,
            date: new Date().toISOString()
        });
        showToast(`Se ha registrado la donación de ${name} por $${amount.toFixed(2)}`, 'success');
    }

    saveStateToLocalStorage();
    renderApp();
}

/**
 * Añade fondos de manera rápida a un donante específico por su índice
 * @param {number} index - Índice en el array global
 * @param {number} extraAmount - Cantidad extra a sumar
 */
function quickAddFunds(index, extraAmount) {
    if (index < 0 || index >= state.donors.length || isNaN(extraAmount) || extraAmount <= 0) return;

    const donor = state.donors[index];
    donor.amount += extraAmount;
    donor.date = new Date().toISOString();

    showToast(`Se sumaron $${extraAmount.toFixed(2)} a ${donor.name}. Total: $${donor.amount.toFixed(2)}`, 'success');

    saveStateToLocalStorage();
    renderApp();
}

/**
 * Elimina una donación
 * @param {number} index - Índice del donante a eliminar
 */
function deleteDonation(index) {
    if (index < 0 || index >= state.donors.length) return;

    const name = state.donors[index].name;
    state.donors.splice(index, 1);
    showToast(`Se eliminó el registro de donaciones de ${name}`, 'info');

    saveStateToLocalStorage();
    renderApp();
}

/**
 * Modifica la meta de recaudación
 * @param {number} newGoal - Nuevo monto meta
 */
function updateGoal(newGoal) {
    if (isNaN(newGoal) || newGoal <= 0) return;
    state.goal = newGoal;
    saveStateToLocalStorage();
    renderApp();
    showToast(`La meta se ha ajustado a $${newGoal.toFixed(2)}`, 'success');
}

/**
 * Borra toda la base de datos de donaciones (con confirmación de seguridad)
 */
function resetAllData() {
    if (confirm('¿Estás seguro de que deseas borrar TODAS las donaciones registradas? Esta acción no se puede deshacer.')) {
        state.donors = [];
        saveStateToLocalStorage();
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
    let filteredDonors = state.donors.map((d, index) => ({ ...d, originalIndex: index }));
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

        html += `
            <div class="donor-card" data-index="${donor.originalIndex}">
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
                            <button class="btn-action btn-action-add" onclick="openQuickAddModal(${donor.originalIndex})" title="Agregar más dinero">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <button class="btn-action btn-action-edit" onclick="editDonorForm(${donor.originalIndex})" title="Editar registro">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="btn-action btn-action-delete" onclick="deleteDonation(${donor.originalIndex})" title="Eliminar registro">
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
    document.getElementById('form-donation').addEventListener('submit', (e) => {
        e.preventDefault();
        const editIdx = document.getElementById('edit-donor-index').value;
        const nameInput = document.getElementById('input-donor-name');
        const amountInput = document.getElementById('input-amount');

        const name = nameInput.value;
        const amount = parseFloat(amountInput.value);

        if (editIdx !== '') {
            // Caso Edición Directa completa de un registro
            const index = parseInt(editIdx);
            const originalName = state.donors[index].name;
            state.donors[index].name = name.trim();
            state.donors[index].amount = amount;

            showToast(`Se ha modificado el registro de ${originalName}`, 'success');

            // Limpiar modo edición
            document.getElementById('edit-donor-index').value = '';
            document.getElementById('btn-submit-text').textContent = 'Guardar Donación';
            document.getElementById('btn-cancel-edit').classList.add('hidden');

            saveStateToLocalStorage();
            renderApp();
        } else {
            // Caso Registro/Suma Normal
            handleAddOrUpdateDonation(name, amount);
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
function handleChangePin() {
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
    saveStateToLocalStorage();
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
function editDonorForm(index) {
    if (index < 0 || index >= state.donors.length) return;
    const donor = state.donors[index];

    document.getElementById('input-donor-name').value = donor.name;
    document.getElementById('input-amount').value = donor.amount;
    document.getElementById('edit-donor-index').value = index;

    document.getElementById('btn-submit-text').textContent = 'Actualizar Registro';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');

    showToast(`Editando a ${donor.name}. Modifica el formulario y presiona Guardar.`, 'info');
    document.getElementById('input-donor-name').focus();
}

// Abre el modal rápido para añadir más dinero a un donante específico
function openQuickAddModal(index) {
    if (index < 0 || index >= state.donors.length) return;
    const donor = state.donors[index];

    document.getElementById('quick-donor-index').value = index;
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
function handleQuickFundsSubmit() {
    const idx = parseInt(document.getElementById('quick-donor-index').value);
    const amount = parseFloat(document.getElementById('input-quick-amount').value);

    if (amount > 0) {
        quickAddFunds(idx, amount);
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
