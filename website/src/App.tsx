import { HERO } from './copy/ledger';

export default function App() {
  return (
    <main>
      <section>
        <h1 style={{ fontSize: 48, margin: 0, fontWeight: 400 }}>{HERO.bigZh}</h1>
        <p style={{
          fontFamily: 'var(--font-serif-italic)',
          fontStyle: 'italic',
          color: 'var(--text-color-soft)',
        }}>
          {HERO.bigEn}
        </p>
      </section>
    </main>
  );
}
