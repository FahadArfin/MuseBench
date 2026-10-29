// Shared presentation/host policy. Rendering a link never expands host access.
export function allowedExternal(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (['dev.meta.ai','github.com','meta-models.github.io','accountscenter.meta.com','auth.meta.com','auth.meta.ai'].includes(u.hostname) || (u.hostname === 'www.google.com' && u.pathname === '/search' && [...u.searchParams.keys()].every(key=>key==='q') && u.searchParams.getAll('q').length===1 && Boolean(u.searchParams.get('q')?.trim()) && !u.hash)); } catch { return false; }
}
