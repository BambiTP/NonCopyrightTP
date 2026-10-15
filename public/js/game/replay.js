// Plays a recorded game (/replays/gameFile, one [ms, event, data] JSON array per line)
// through the same Game state as a live game, on a virtual clock that can pause, change speed and seek.
(function () {
  function Replay(game, key) {
    this.game = game;
    this.key = key;
    this.events = [];
    this.i = 0;          // next event to play
    this.t = 0;          // virtual time, ms since the recording started
    this.speed = 1;
    this.paused = false;
    this.follow = null;  // player id the camera follows
    var self = this;
    game.clock = function () { return self.t; };
  }

  Replay.prototype.load = function () {
    var self = this;
    return fetch('/replays/gameFile?key=' + encodeURIComponent(this.key), { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(r.headers.get('X-Replay-Error') || 'Replay not found');
      self.title = r.headers.get('X-Replay-Filename') || '';
      return r.text();
    }).then(function (text) {
      text.split('\n').forEach(function (line) {
        if (!line) return;
        try {
          var e = JSON.parse(line);
          if (e[1] === 'recorder-metadata') self.meta = e[2];
          else if (e[1] !== 'connect') self.events.push(e);
        } catch (err) { /* a cut-off last line */ }
      });
      self.duration = self.events.length ? self.events[self.events.length - 1][0] : 0;
      return self;
    });
  };

  Replay.prototype.dispatch = function (e) {
    if (e[1] === 'id') { if (this.follow == null) this.follow = e[2]; return; } // the recorder follows a player; the viewer isn't one
    this.game.handle(e[1], e[2]);
  };

  // advance the virtual clock by dt real ms, playing the events that come due
  Replay.prototype.advance = function (dt) {
    if (this.paused) return 0;
    var step = dt * this.speed;
    this.t = Math.min(this.duration, this.t + step);
    while (this.i < this.events.length && this.events[this.i][0] <= this.t) this.dispatch(this.events[this.i++]);
    if (this.t >= this.duration) this.paused = true;
    return step;
  };

  // jump to time t: start over and play everything up to t at once, without sounds
  Replay.prototype.seek = function (t) {
    var g = this.game;
    g.silent = true;
    g.reset();
    this.i = 0;
    this.t = 0;
    while (this.i < this.events.length && this.events[this.i][0] <= t) {
      this.t = this.events[this.i][0];
      this.dispatch(this.events[this.i++]);
    }
    this.t = t;
    g.effects = [];
    g.silent = false;
    g.emit('seeked');
  };

  window.BPReplay = Replay;
})();
