export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  console.log(`[EMAIL] Password reset email would be sent to ${email} with token ${token}`);
  return true;
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  console.log(`[EMAIL] Verification email would be sent to ${email} with token ${token}`);
  return true;
}
