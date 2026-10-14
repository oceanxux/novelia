'use strict';
// 系统指标采样: CPU / 内存 / 负载 / 网络 / 运行时间
// 对齐 /api/server_status 契约: { cpu_usage, memory_usage, network_rx, network_tx, load_1/5/15, uptime, network_usage }
const os = require('os');
const { exec } = require('child_process');

// ---- CPU: 用两次 os.cpus() 快照的 idle/total 差值算占用率 ----
let lastCpu = snapshotCpu();
let cpuUsage = 0;

function snapshotCpu() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const t of Object.keys(c.times)) total += c.times[t];
    idle += c.times.idle;
  }
  return { idle, total };
}

function sampleCpu() {
  const cur = snapshotCpu();
  const idleDiff = cur.idle - lastCpu.idle;
  const totalDiff = cur.total - lastCpu.total;
  lastCpu = cur;
  if (totalDiff > 0) cpuUsage = (1 - idleDiff / totalDiff) * 100;
  return cpuUsage;
}

// ---- 网络: netstat -ib 汇总各接口收发字节, 差分算 KB/s ----
let lastNet = null; // { rx, tx, ts }
let netRate = { rx: 0, tx: 0 };

function readNetBytes() {
  return new Promise((resolve) => {
    // -i 接口表, -b 字节数; 同一接口可能有 IPv4/IPv6 多行, 取首行 Link# 汇总
    exec('netstat -ib', { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const seen = new Set();
      let rx = 0, tx = 0;
      const lines = stdout.split('\n').slice(1);
      for (const line of lines) {
        const f = line.trim().split(/\s+/);
        if (f.length < 10) continue;
        const iface = f[0];
        // 每接口只统计一次 (避免 IPv6 行重复)
        if (seen.has(iface)) continue;
        const r = Number(f[6]);
        const t = Number(f[9]);
        if (!Number.isFinite(r) || !Number.isFinite(t)) continue;
        seen.add(iface);
        rx += r; tx += t;
      }
      resolve({ rx, tx });
    });
  });
}

async function sampleNet() {
  const cur = await readNetBytes();
  if (!cur) return netRate;
  const now = Date.now();
  if (lastNet) {
    const dt = (now - lastNet.ts) / 1000;
    if (dt > 0) {
      netRate = {
        rx: Math.max(0, (cur.rx - lastNet.rx) / 1024 / dt),
        tx: Math.max(0, (cur.tx - lastNet.tx) / 1024 / dt),
      };
    }
  }
  lastNet = { rx: cur.rx, tx: cur.tx, ts: now };
  return netRate;
}

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天${h > 0 ? h + '小时' : ''}`;
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

function snapshot() {
  const total = os.totalmem();
  const free = os.freemem();
  const memPct = total > 0 ? ((total - free) / total) * 100 : 0;
  const [l1, l5, l15] = os.loadavg();
  const rx = Number(netRate.rx.toFixed(1));
  const tx = Number(netRate.tx.toFixed(1));
  return {
    cpu_usage: Number(cpuUsage.toFixed(1)),
    memory_usage: Number(memPct.toFixed(1)),
    network_rx: rx,
    network_tx: tx,
    load_1: Number(l1.toFixed(2)),
    load_5: Number(l5.toFixed(2)),
    load_15: Number(l15.toFixed(2)),
    uptime: formatUptime(os.uptime()),
    network_usage: rx > 5000 || tx > 5000 ? '繁忙' : '正常',
  };
}

// 后台采样循环 (2s)
let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => {
    sampleCpu();
    sampleNet().catch(() => {});
  }, 2000);
  timer.unref && timer.unref();
}
function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, snapshot };
