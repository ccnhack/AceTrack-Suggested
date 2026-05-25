import fs from 'fs';
import path from 'path';

// read pm2 logs or just look at recent terminal output?
// We don't have server logs natively accessible unless they are in ~/.pm2/logs or standard out.
