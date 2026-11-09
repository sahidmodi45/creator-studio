import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { getUser, homeFor } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getUser();
  if (user) {
    const home = await homeFor(user);
    if (!home.startsWith("/login")) redirect(home);
  }
  return (
    <main className="auth">
      <div className="auth-card">
        <p className="kicker">The studio</p>
        <h1 className="display">Welcome <em>back</em></h1>
        <SignInForm />
      </div>
    </main>
  );
}
