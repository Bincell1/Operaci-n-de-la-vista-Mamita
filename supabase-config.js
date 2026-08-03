/**
 * CONFIGURACIÓN DE SUPABASE
 * --------------------------------------------------------------------------
 * Sustituye estos valores por los de TU proyecto en https://supabase.com
 *   Project URL:      Settings > API > Project URL
 *   anon public key:  Settings > API > Project API keys > anon public
 *
 * NUNCA uses la clave "service_role" en el código del frontend: esa clave
 * puede saltarse las políticas de seguridad (RLS). Solo usamos la clave
 * "anon", que está pensada para exponerse públicamente y se controla con
 * Row Level Security (RLS) en Supabase.
 */
const SUPABASE_URL = 'https://flepkdmdhvjpluanzglh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_38h19Zz0rL9uEChwzXhcXA_U1hDD1g3';

// Tabla única que guarda meta y pin (solo una fila; id = 1)
const SETTINGS_TABLE = 'mamita_settings';
// Tabla de donantes
const DONORS_TABLE = 'mamita_donors';

// Cliente Supabase (se inicializa cuando se carga el script de Supabase)
let supabaseClient = null;

function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase SDK no cargado. Revisa el <script> en index.html');
        return null;
    }
    if (supabaseClient) return supabaseClient;

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } }
    });
    return supabaseClient;
}

// Verifica que las credenciales hayan sido reemplazadas
function isSupabaseConfigured() {
    return SUPABASE_URL &&
        !SUPABASE_URL.includes('TU-PROYECTO') &&
        SUPABASE_ANON_KEY &&
        !SUPABASE_ANON_KEY.includes('Pega-aqui');
}
