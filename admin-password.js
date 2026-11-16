#!/usr/bin/env node
'use strict';
// Reset the admin password:  node admin-password.js            (generates a random one)
//                            node admin-password.js "my new password"
const path = require('path');
const creds = require('./lib/admin-creds');
const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
const pw = process.argv[2] || creds.randomPassword();
if (pw.length < 10) { console.error('Password must be at least 10 characters.'); process.exit(1); }
const c = creds.setPassword(dir, pw);
console.log(`\n  Admin username: ${c.user}\n  Admin password: ${pw}\n\n  No server restart is required.\n`);
