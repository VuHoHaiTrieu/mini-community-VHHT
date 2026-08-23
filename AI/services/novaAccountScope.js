import { firebaseAuthentication } from '../../shared/firebase-connection.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

class NovaAccountScope extends EventTarget {
  constructor() {
    super();
    this.uid = firebaseAuthentication.currentUser?.uid || null;
    this.ready = Boolean(firebaseAuthentication.currentUser);
    onAuthStateChanged(firebaseAuthentication, user => {
      const previousUid = this.uid;
      this.uid = user?.uid || null;
      this.ready = true;
      if (previousUid !== this.uid) {
        this.dispatchEvent(new CustomEvent('change', { detail: { uid: this.uid, previousUid } }));
      }
    });
  }

  getUid() { return this.uid; }

  key(baseKey) {
    // Guest data is deliberately kept in a separate scope and is never migrated
    // into a signed-in account. This prevents one account seeing another's AI.
    return `${baseKey}:account:${this.uid || 'guest'}`;
  }

  subscribe(listener) {
    const handler = event => listener(event.detail);
    this.addEventListener('change', handler);
    return () => this.removeEventListener('change', handler);
  }
}

export const novaAccountScope = new NovaAccountScope();
