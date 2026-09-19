import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } from '../config.js';

const fetchWithTimeout = (url, options = {}) => {
  const timeoutSignal = AbortSignal.timeout(8000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  return fetch(url, { ...options, signal });
};

export function userClient(jwt) {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`
      },
      fetch: fetchWithTimeout
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

let _adminClient = null;

export function adminClient() {
  if (!_adminClient) {
    _adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      global: {
        fetch: fetchWithTimeout
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }
  return _adminClient;
}
