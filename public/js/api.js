(function () {
  window.VI = window.VI || {};

  window.VI.api = async function api(path, options = {}) {
    if (!window.VI.auth || !window.VI.auth.getToken) {
      throw new Error('Auth module not initialized');
    }

    const token = await window.VI.auth.getToken();
    if (!token) {
      const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
      if (!urlParams || urlParams.get('skip_auth') !== '1') {
        await window.VI.auth.signOut();
      }
      const err = new Error('Authentication required');
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }

    const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };

    let body = options.body;
    if (body !== undefined && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const res = await fetch(url, {
      method,
      headers,
      body
    });

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      if (res.status === 401) {
        await window.VI.auth.signOut();
      }

      const backendError = (typeof data === 'object' && data?.error) ? data.error : {};
      const err = new Error(backendError.message || (typeof data === 'string' ? data : `Request failed with status ${res.status}`));
      err.code = backendError.code || (res.status === 401 ? 'UNAUTHENTICATED' : 'API_ERROR');
      err.status = res.status;
      if (backendError.details !== undefined) {
        err.details = backendError.details;
      }
      throw err;
    }

    return data;
  };
})();
