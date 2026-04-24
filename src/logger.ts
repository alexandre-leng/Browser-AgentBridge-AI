export function log(level: string, msg: string, meta?: any) {
  const entry = { t: new Date().toISOString(), level, msg, ...meta };
  console.log(JSON.stringify(entry));
}
