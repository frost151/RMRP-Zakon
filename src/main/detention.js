'use strict';
// Таймер задержания по Процессуальному кодексу:
//   ст. 6 — задержание не более 60 минут (предварительное — 15 минут);
//   ст. 9.2, 9.6 — ожидание адвоката: 5 минут на ответ, 5 минут на прибытие, время задержания стоит;
//   ст. 10.3 — задержание сотрудника госорганизации: вызов СК / прокуратуры / руководства,
//              5 минут на ответ, 10 минут на прибытие;
//   ст. 14.2 — на время ожидания адвоката и руководства время задержания останавливается;
//   ст. 8 — телефонный звонок 2 минуты, конфиденциальная беседа с адвокатом 5 минут.

const MIN = 60 * 1000;
// Для проверки звуков можно поставить, например, 15 * 1000 (15 секунд). Для выпуска — null (60 минут)
const TEST_LIMIT = null;
const LIMITS = { full: TEST_LIMIT || 60 * MIN, prelim: 15 * MIN };
const WAITS = {
  lawyer: { response: 5 * MIN, arrival: 5 * MIN },
  gov: { response: 5 * MIN, arrival: 10 * MIN },
};
const SHORT = { call: 2 * MIN, talk: 5 * MIN };
const WARN_AT = TEST_LIMIT ? [5 * 1000] : [10 * MIN, 5 * MIN, 1 * MIN];

function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

class Detention {
  // onChange(state), onAlert(text, sound) — звук в окне планшета (start, pause, resume, stop, expired, alert);
  // text может быть пустым — тогда только звук, без всплывающего сообщения
  constructor(onChange, onAlert) {
    this.onChange = onChange;
    this.onAlert = onAlert;
    this.flags = { gov: false, immunity: false, prelim: false };
    this.reset(false);
    setInterval(() => this.tick(), 500);
  }

  reset(notify = true) {
    this.s = {
      running: false,
      startedAt: 0,
      elapsed: 0, // накоплено до resumedAt
      resumedAt: 0,
      manualPause: false,
      expired: false,
      warned: [],
      lawyer: null, // { phase: 'response'|'arrival', since }
      gov: null,
      short: null, // { kind: 'call'|'talk', since }
      log: [],
    };
    if (notify) this.emit();
  }

  limit() {
    return this.flags.prelim ? LIMITS.prelim : LIMITS.full;
  }

  paused() {
    return this.s.manualPause || !!this.s.lawyer || !!this.s.gov || this.s.expired;
  }

  elapsed(now = Date.now()) {
    const s = this.s;
    if (!s.running) return s.elapsed;
    return s.elapsed + (this.paused() ? 0 : now - s.resumedAt);
  }

  // Любое изменение состояния — через mutate: накопленное время фиксируется до изменения паузы
  mutate(fn) {
    const now = Date.now();
    this.s.elapsed = this.elapsed(now);
    this.s.resumedAt = now;
    fn(now);
    this.emit();
  }

  log(text) {
    this.s.log.push({ t: Date.now(), text });
  }

  // Конец ожидания (прибыли / не ответили / не прибыли) — задержание продолжается само (ПК 9.2, 10.3),
  // даже если до вызова стояла ручная пауза. Вызывать внутри mutate или после фиксации elapsed.
  autoResume() {
    this.s.manualPause = false;
    if (!this.paused()) this.log(`Время задержания продолжено автоматически (осталось ${fmt(this.limit() - this.s.elapsed)})`);
  }

  // --- Действия ---

  start() {
    if (this.s.running) return;
    this.reset(false);
    this.mutate((now) => {
      this.s.running = true;
      this.s.startedAt = now;
      this.log(`Начато ${this.flags.prelim ? 'предварительное задержание' : 'задержание'} (${fmt(this.limit())}, ст. ${this.flags.prelim ? '6.3' : '6.1'} ПК)`);
      if (this.flags.gov) this.log('Задержанный — сотрудник госорганизации / адвокат (ст. 10.3, 12 ПК)');
      if (this.flags.immunity) this.log('Задержанный заявил о статусе неприкосновенности (ст. 17 ПК)');
    });
    this.onAlert('', 'start');
  }

  togglePause() {
    if (!this.s.running) return this.start();
    if (this.s.expired) return;
    this.mutate(() => {
      this.s.manualPause = !this.s.manualPause;
      this.log(this.s.manualPause ? 'Пауза (допрос / иные причины, ст. 14.2 ПК)' : 'Задержание продолжено');
    });
    this.onAlert('', this.s.manualPause ? 'pause' : 'resume');
  }

  stop() {
    if (!this.s.running) return;
    this.mutate(() => {
      this.log(`Задержание окончено. Затрачено ${fmt(this.elapsed())}`);
      this.s.running = false;
      this.s.lawyer = null;
      this.s.gov = null;
      this.s.short = null;
    });
    this.onAlert('', 'stop');
  }

  // Один шаг ожидания: вызов → ответ → прибытие
  waitStep(who) {
    if (!this.s.running) this.start();
    const names = {
      lawyer: { call: 'адвоката', answered: 'Адвокат ответил', arrived: 'Адвокат прибыл' },
      gov: {
        call: 'СК / прокуратуры / руководства',
        answered: 'Представители СК / прокуратуры / руководства ответили',
        arrived: 'Представители СК / прокуратуры / руководства прибыли',
      },
    }[who];
    const arrived = this.s[who] && this.s[who].phase === 'arrival';
    this.mutate((now) => {
      const w = this.s[who];
      if (!w) {
        this.s[who] = { phase: 'response', since: now };
        this.log(`Вызов ${names.call} по рации — ожидание ответа ${WAITS[who].response / MIN} мин`);
      } else if (w.phase === 'response') {
        this.s[who] = { phase: 'arrival', since: now };
        this.log(`${names.answered} — ожидание прибытия ${WAITS[who].arrival / MIN} мин`);
      } else {
        this.s[who] = null;
        this.log(names.arrived);
        this.autoResume();
      }
    });
    if (arrived && !this.paused()) this.onAlert(`${names.arrived} — время задержания продолжено`, 'resume');
  }

  cancelWait(who) {
    if (!this.s[who]) return;
    this.mutate(() => {
      this.s[who] = null;
      this.log(who === 'lawyer' ? 'Ожидание адвоката отменено (отказ от права, ст. 9.5 ПК)' : 'Ожидание представителей отменено');
    });
  }

  startShort(kind) {
    if (!this.s.running) return;
    this.mutate((now) => {
      this.s.short = { kind, since: now };
      this.log(kind === 'call' ? 'Телефонный звонок задержанного (2 мин, ст. 8 ПК)' : 'Конфиденциальная беседа с адвокатом (5 мин, ст. 8 ПК)');
    });
  }

  setFlags(patch) {
    this.mutate(() => {
      Object.assign(this.flags, patch);
      if (this.s.running && 'gov' in patch) this.log(patch.gov ? 'Отмечено: задержан сотрудник госорганизации / адвокат' : 'Снята отметка о госслужащем');
      if (patch.gov === false && this.s.gov) {
        this.s.gov = null;
        this.log('Ожидание представителей отменено');
      }
      if (this.s.running && 'immunity' in patch) this.log(patch.immunity ? 'Отмечено: статус неприкосновенности' : 'Снята отметка о неприкосновенности');
    });
  }

  // --- Автоматические переходы ---

  tick() {
    const s = this.s;
    if (!s.running) return;
    const now = Date.now();
    let changed = false;
    const alerts = [];

    for (const who of ['lawyer', 'gov']) {
      const w = s[who];
      if (!w || now - w.since < WAITS[who][w.phase]) continue;
      this.s.elapsed = this.elapsed(now);
      this.s.resumedAt = now;
      s[who] = null;
      const text = who === 'lawyer'
        ? (w.phase === 'response'
          ? 'Адвокат не ответил за 5 мин — задержание продолжается (ст. 9.2 ПК)'
          : 'Адвокат не прибыл за 5 мин — право считается реализованным (ст. 9.5 ПК)')
        : (w.phase === 'response'
          ? 'Представители не ответили за 5 мин — продолжить и передать дело в СК (ст. 10.3 ПК)'
          : 'Представители не прибыли за 10 мин — продолжить и передать дело в СК (ст. 10.3 ПК)');
      this.log(text);
      this.autoResume();
      alerts.push(text);
      changed = true;
    }

    if (s.short && now - s.short.since >= SHORT[s.short.kind]) {
      const text = s.short.kind === 'call' ? 'Время звонка (2 мин) истекло' : 'Время беседы с адвокатом (5 мин) истекло';
      s.short = null;
      this.log(text);
      alerts.push(text);
      changed = true;
    }

    const left = this.limit() - this.elapsed(now);
    for (const w of WARN_AT) {
      if (left <= w && left > 0 && !s.warned.includes(w) && w < this.limit()) {
        s.warned.push(w);
        alerts.push({ text: `До конца задержания ${w >= MIN ? `${w / MIN} мин` : `${w / 1000} сек`}`, sound: 'warn' });
        changed = true;
      }
    }
    if (left <= 0 && !s.expired) {
      this.s.elapsed = this.limit();
      s.expired = true;
      const text = 'Время задержания истекло — лицо подлежит освобождению (ст. 14.1 п. 3 ПК)';
      this.log(text);
      alerts.push({ text, sound: 'expired' });
      changed = true;
    }

    if (changed) this.emit();
    for (const a of alerts) {
      if (typeof a === 'string') this.onAlert(a, 'alert');
      else this.onAlert(a.text, a.sound);
    }
  }

  state() {
    return { ...this.s, flags: { ...this.flags }, limit: this.limit(), now: Date.now(), elapsedNow: this.elapsed(), paused: this.paused(), waits: WAITS, shortLimits: SHORT };
  }

  emit() {
    this.onChange(this.state());
  }
}

module.exports = { Detention };
