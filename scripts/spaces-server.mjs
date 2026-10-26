import path from 'node:path';
import {createSpacesHub} from '../src/spaces/hub.mjs';

if (process.argv.includes('--help')) {
  console.log(`MuseBench Spaces server
Run: node scripts/spaces-server.mjs

Environment:
  SPACES_DATA_DIR    Persistent local directory (default: ./data/spaces-server)
  SPACES_HOST        Bind address (default: 127.0.0.1)
  SPACES_PORT        Listen port (default: 4578; 0 chooses a free port)
  SPACES_PUBLIC_URL  Public HTTPS origin when using a TLS reverse proxy
  SPACES_ADMIN_TOKEN Optional random base64url secret, 43+ characters

The server has no browser UI or anonymous signup. See docs/SPACES-SERVER.md.`);
} else {
  try {
    const adminToken=process.env.SPACES_ADMIN_TOKEN || undefined;
    delete process.env.SPACES_ADMIN_TOKEN;
    const hub=await createSpacesHub({
      dataDir:path.resolve(process.env.SPACES_DATA_DIR || 'data/spaces-server'),
      host:process.env.SPACES_HOST || '127.0.0.1',
      port:process.env.SPACES_PORT === undefined || process.env.SPACES_PORT === '' ? 4578 : Number(process.env.SPACES_PORT),
      publicUrl:process.env.SPACES_PUBLIC_URL || undefined,
      adminToken,
    });
    console.log(`Spaces hub ready: ${hub.url}`);
    console.log(process.env.SPACES_PUBLIC_URL ? 'Use the configured HTTPS reverse proxy for remote clients.' : 'Local connections only. Other computers need a hosted HTTPS origin.');
    let stopping=false;
    const stop=async()=>{
      if (stopping) return;
      stopping=true;
      try {await hub.close();process.exitCode=0;} catch {console.error('Spaces server could not close cleanly.');process.exitCode=1;}
    };
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  } catch(error) {
    console.error(`Spaces server could not start: ${error.message}`);
    process.exitCode=1;
  }
}
