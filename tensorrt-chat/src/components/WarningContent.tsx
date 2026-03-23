export function WarningContent() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1020] px-6 text-slate-100">
      <section className="w-full max-w-2xl rounded-[32px] border border-slate-800 bg-slate-950/90 p-8 shadow-panel">
        <span className="inline-flex rounded-full border border-amber-700/40 bg-amber-950/50 px-3 py-2 text-xs uppercase tracking-[0.24em] text-amber-300">
          Access Warning
        </span>
        <h1 className="mt-5 text-3xl font-semibold text-white">You are not accessing this system properly.</h1>
        <p className="mt-4 text-base leading-8 text-slate-300">
          Direct access to the TensorRT chat app is not allowed. You must sign in as an admin on the news site and open
          this tool from the admin panel.
        </p>
        <p className="mt-3 text-sm leading-7 text-slate-400">
          Go back to the admin dashboard, then use the <strong>Open Chat App</strong> button to enter correctly.
        </p>
      </section>
    </main>
  );
}
