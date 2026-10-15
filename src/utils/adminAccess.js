import { createContext, useContext } from 'react';
export const AdminAccessContext = createContext({ user: null, canManage: false });
export const useAdminAccess = () => useContext(AdminAccessContext);
export async function adminFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'ParkingJi');
  const response = await fetch(url, { ...options, headers, credentials: 'include', cache: 'no-store' });
  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new Event('admin-access-invalid'));
  }
  return response;
}
