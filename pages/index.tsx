import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { User } from 'firebase/auth';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Video Generator Episodes</h1>
      <p>Firebase setup complete!</p>
      {user ? (
        <div>
          <p>Welcome, {user.email}!</p>
          <button onClick={() => auth.signOut()}>Sign Out</button>
        </div>
      ) : (
        <div>
          <p>Please sign in to continue.</p>
          <a href="/auth/signin">Sign In</a>
        </div>
      )}
    </div>
  );
}