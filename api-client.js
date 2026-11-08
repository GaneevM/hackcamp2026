let tokenProvider = null;
export function configureApiAuth(provider) { tokenProvider = provider; }
export async function apiHeaders() {
  const headers = {'Content-Type':'application/json'};
  if (tokenProvider) headers.Authorization = 'Bearer ' + await tokenProvider();
  return headers;
}
