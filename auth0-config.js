// Auth0's SPA domain and Client ID are public browser configuration values.
// Fill these from Auth0 > Applications > Formnote > Settings.
window.FORMNOTE_AUTH0_CONFIG = {
  domain: 'dev-nq4wzkj35d08hmds.us.auth0.com',
  clientId: 'kgZffBxFat1RgVYqMWY6Rgww7OiShO61',
};

if (window.FORMNOTE_AUTH0_CONFIG.domain && window.FORMNOTE_AUTH0_CONFIG.clientId) {
  document.documentElement.classList.add('auth-enabled');
}
