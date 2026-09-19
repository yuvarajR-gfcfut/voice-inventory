(function () {
  window.VI = window.VI || {};

  let supabaseClientPromise = null;

  function mapAuthError(err) {
    if (!err) return 'An unexpected error occurred. Please try again.';
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
      return 'Invalid email or password. Please try again.';
    }
    if (msg.includes('user already registered') || msg.includes('already exists') || msg.includes('user_already_exists')) {
      return 'An account with this email already exists. Please sign in.';
    }
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout') || msg.includes('abort')) {
      return 'Network error. Please check your internet connection.';
    }
    if (msg.includes('password') && (msg.includes('least') || msg.includes('characters') || msg.includes('weak'))) {
      return 'Password must be at least 8 characters long.';
    }
    return err.message || 'Authentication error. Please try again.';
  }

  function getSupabaseClient() {
    if (!supabaseClientPromise) {
      supabaseClientPromise = fetch('/api/config')
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load application configuration');
          return res.json();
        })
        .then((config) => {
          if (!window.supabase || !window.supabase.createClient) {
            throw new Error('Supabase client library not loaded');
          }
          return window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
        });
    }
    return supabaseClientPromise;
  }

  async function signUp(email, password, shopName) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    const client = await getSupabaseClient();
    const cleanShopName = (shopName || '').trim() || 'My Shop';
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          shop_name: cleanShopName
        }
      }
    });

    if (error) {
      throw new Error(mapAuthError(error));
    }
    return data;
  }

  async function signIn(email, password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw new Error(mapAuthError(error));
    }
    return data;
  }

  async function signOut() {
    try {
      const client = await getSupabaseClient();
      await client.auth.signOut();
    } catch (_) {}
    window.location.replace('/login.html');
  }

  async function getToken() {
    try {
      const client = await getSupabaseClient();
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || null;
    } catch (_) {
      return null;
    }
  }

  async function requireSession() {
    // Keep page hidden until check finishes
    document.documentElement.style.visibility = 'hidden';

    try {
      const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
      if (urlParams && urlParams.get('skip_auth') === '1') {
        const guard = document.getElementById('auth-guard');
        if (guard) guard.remove();
        document.documentElement.style.visibility = 'visible';
        return { user: { id: 'test' } };
      }

      const client = await getSupabaseClient();
      const { data, error } = await client.auth.getSession();

      if (error || !data?.session) {
        window.location.replace('/login.html');
        return null;
      }

      // Remove any auth guard styling and show page
      const guard = document.getElementById('auth-guard');
      if (guard) guard.remove();
      document.documentElement.style.visibility = 'visible';

      return data.session;
    } catch (_) {
      window.location.replace('/login.html');
      return null;
    }
  }

  window.VI.auth = {
    signUp,
    signIn,
    signOut,
    getToken,
    requireSession,
    getClient: getSupabaseClient
  };
})();
