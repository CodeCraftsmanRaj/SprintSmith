const input = "w-full px-space-sm py-2 rounded bg-surface-container border border-outline-variant/40 font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary";

export const bodyClass = "bg-surface font-body-md text-body-md text-on-surface antialiased";
export const script = `
document.querySelectorAll('[data-auth-tab]').forEach(function (t) {
  t.addEventListener('click', function () {
    var mode = t.getAttribute('data-auth-tab');
    document.querySelectorAll('[data-auth-tab]').forEach(function (x) {
      var on = x === t;
      x.classList.toggle('bg-surface-container-highest', on);
      x.classList.toggle('text-on-surface', on);
      x.classList.toggle('text-on-surface-variant', !on);
    });
    document.getElementById('name-field').classList.toggle('hidden', mode !== 'register');
    document.getElementById('auth-submit-label').textContent = mode === 'register' ? 'Create account' : 'Sign in';
  });
});
`;
export const html = `
<div class="min-h-screen grid grid-cols-1 lg:grid-cols-2">
  <div class="hidden lg:flex flex-col justify-between p-margin-desktop bg-surface-container-low border-r border-outline-variant/30">
    <div class="flex items-center gap-space-xs"><div class="w-6 h-6 rounded bg-primary-container flex items-center justify-center"><span class="material-symbols-outlined text-[16px] text-on-primary-container">terminal</span></div><span class="font-headline-md text-headline-md font-semibold">DevPilot</span></div>
    <div class="flex flex-col gap-space-lg max-w-md">
      <h1 class="font-headline-xl text-headline-xl text-on-surface">Requirements in. Engineering artifacts out.</h1>
      <p class="font-body-lg text-body-lg text-on-surface-variant">AI-powered SDLC co-pilot that turns business requirements into user stories, Gherkin, OpenAPI specs, tests and sprint plans — fully traceable.</p>
      <div class="flex flex-col gap-space-sm font-label-md text-label-md text-on-surface-variant">
        ${["01 Ingest & Docling Tree", "02 Synthesize & SOP Graph", "03 Verify & Matrix", "04 Plan & Sprint Backlog"].map((s) => `<div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-[16px] text-primary">check_circle</span>${s}</div>`).join("")}
      </div>
    </div>
    <span class="font-label-sm text-label-sm text-outline">Barclays Early Careers · Banking Technology</span>
  </div>
  <div class="flex items-center justify-center p-margin-desktop">
    <div class="w-full max-w-sm flex flex-col gap-space-lg">
      <div><h2 class="font-headline-lg text-headline-lg">Welcome back</h2><p class="font-body-md text-body-md text-on-surface-variant">Sign in to your engineering workspace.</p></div>
      <div class="flex p-0.5 rounded bg-surface-container font-body-sm text-body-sm">
        <button data-auth-tab="login" class="flex-1 py-1.5 rounded bg-surface-container-highest text-on-surface" type="button">Sign in</button>
        <button data-auth-tab="register" class="flex-1 py-1.5 rounded text-on-surface-variant" type="button">Register</button>
      </div>
      <form class="flex flex-col gap-space-md" onsubmit="return false">
        <label id="name-field" class="hidden flex-col gap-1"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Full name</span><input class="${input}" placeholder="Devansh Mhatre"/></label>
        <label class="flex flex-col gap-1"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Email</span><input type="email" class="${input}" placeholder="you@barclays.com"/></label>
        <label class="flex flex-col gap-1"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Password</span><input type="password" class="${input}" placeholder="••••••••"/></label>
        <a data-path="01-ingest" href="#" class="flex items-center justify-center gap-space-xs py-2 rounded bg-primary-container text-on-primary font-body-sm text-body-sm font-medium hover:bg-primary"><span id="auth-submit-label">Sign in</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></a>
      </form>
      <div class="flex items-center justify-between px-space-sm py-1.5 rounded bg-surface-container-lowest font-label-sm text-label-sm text-on-surface-variant"><span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>Gateway :8002</span><span class="text-outline">JWT · RBAC</span></div>
    </div>
  </div>
</div>`;
