// A foto em user.photoURL é gravada no primeiro login e não acompanha trocas no Google.
// providerData é atualizado a cada login.
// No login, Login.jsx copia a foto atual do Google para user.photoURL.
export function userPhoto(user) {
  return user?.photoURL || user?.providerData?.find(p => p.providerId === 'google.com')?.photoURL || null
}
