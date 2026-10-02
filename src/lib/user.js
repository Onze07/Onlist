// A foto em user.photoURL é gravada no primeiro login e não acompanha trocas no Google.
// providerData é atualizado a cada login.
export function userPhoto(user) {
  return user?.providerData?.find(p => p.providerId === 'google.com')?.photoURL || user?.photoURL || null
}
