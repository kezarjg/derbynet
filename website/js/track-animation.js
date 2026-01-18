'use strict';

// TrackAnimation handles the canvas-based track visualization
function TrackAnimation(canvas, options) {
  let self = this;

  // Canvas setup
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');

  // Configuration
  this.laneCount = options.laneCount || 4;
  this.laneMask = options.laneMask || 0xFF;
  this.reverseLanes = options.reverseLanes || false;

  // Track dimensions
  this.trackPadding = 20;
  this.laneWidth = 60;
  this.trackLength = canvas.height - 80; // Leave room for start/finish
  this.startY = 40;
  this.finishY = this.startY + this.trackLength;

  // Car dimensions
  this.carWidth = 40;
  this.carHeight = 25;

  // Lane colors
  this.laneColors = [
    '#e74c3c', // Red
    '#3498db', // Blue
    '#2ecc71', // Green
    '#f1c40f', // Yellow
    '#9b59b6', // Purple
    '#e67e22', // Orange
    '#1abc9c', // Teal
    '#34495e'  // Dark gray
  ];

  // State
  this.cars = [];
  this.raceStartTime = null;
  this.finishTimes = null;
  this.animating = false;
  this.gateOpen = false;
  this.raceComplete = false;
  this.elapsedDisplay = 0;

  // Initialize cars
  this.initCars = function() {
    self.cars = [];
    for (let i = 0; i < self.laneCount; i++) {
      self.cars.push({
        lane: i,
        progress: 0, // 0 = start, 1 = finish
        color: self.laneColors[i % self.laneColors.length],
        active: (self.laneMask & (1 << i)) !== 0,
        dnf: false,
        dnfPosition: 0.3 + Math.random() * 0.4, // Random DNF stop point
        finished: false,
        time: null,
        carnumber: null,  // Car number to display
        racerName: null   // Racer name (for tooltip/display)
      });
    }
  };

  // Set car numbers for each lane
  // carNumbers: object mapping lane (1-indexed) to {carnumber, name, carname}
  // Note: When lanes are reversed, visual lane 0 corresponds to RaceChart lane N
  this.setCarNumbers = function(carNumbers) {
    for (let i = 0; i < self.cars.length; i++) {
      // Map visual lane index to RaceChart lane number
      let raceChartLane;
      if (self.reverseLanes) {
        // Visual lane 0 = RaceChart lane N, visual lane 1 = RaceChart lane N-1, etc.
        raceChartLane = self.laneCount - i;
      } else {
        raceChartLane = i + 1;  // Lanes are 1-indexed
      }

      if (carNumbers[raceChartLane]) {
        self.cars[i].carnumber = carNumbers[raceChartLane].carnumber;
        self.cars[i].racerName = carNumbers[raceChartLane].name;
      } else {
        self.cars[i].carnumber = null;
        self.cars[i].racerName = null;
      }
    }
    self.draw();
  };

  // Update lane count
  this.setLaneCount = function(count) {
    self.laneCount = count;
    self.updateDimensions();
    self.initCars();
    self.draw();
  };

  // Update lane mask
  this.setLaneMask = function(mask) {
    self.laneMask = mask;
    for (let i = 0; i < self.cars.length; i++) {
      self.cars[i].active = (mask & (1 << i)) !== 0;
    }
    self.draw();
  };

  // Update dimensions based on lane count
  this.updateDimensions = function() {
    let totalWidth = self.laneCount * self.laneWidth + self.trackPadding * 2;
    self.canvas.width = Math.max(400, totalWidth);
    self.trackLength = self.canvas.height - 80;
    self.finishY = self.startY + self.trackLength;
  };

  // Reset to starting position
  this.reset = function() {
    self.raceStartTime = null;
    self.finishTimes = null;
    self.animating = false;
    self.gateOpen = false;
    self.raceComplete = false;
    self.elapsedDisplay = 0;
    for (let i = 0; i < self.cars.length; i++) {
      self.cars[i].progress = 0;
      self.cars[i].dnf = false;
      self.cars[i].finished = false;
      self.cars[i].time = null;
    }
    self.draw();
  };

  // Start race with given finish times
  // finishTimes: array of times in seconds (null for DNF)
  this.startRace = function(finishTimes) {
    self.finishTimes = finishTimes;
    self.raceStartTime = performance.now();
    self.gateOpen = true;
    self.raceComplete = false;

    // Set up DNF status
    for (let i = 0; i < self.cars.length; i++) {
      if (finishTimes[i] === null) {
        self.cars[i].dnf = true;
      }
      self.cars[i].time = finishTimes[i];
    }

    self.animating = true;
    requestAnimationFrame(self.animate.bind(self));
  };

  // Animation loop
  this.animate = function(timestamp) {
    if (!self.animating) return;

    let elapsed = (timestamp - self.raceStartTime) / 1000;
    self.elapsedDisplay = elapsed;

    let allFinished = true;
    let maxTime = 0;

    for (let i = 0; i < self.cars.length; i++) {
      let car = self.cars[i];
      if (!car.active) continue;

      if (car.dnf) {
        // DNF: animate to random stop position then stop
        let dnfTime = car.dnfPosition * 5; // DNF happens over ~2.5 seconds
        car.progress = Math.min(car.dnfPosition, elapsed / dnfTime * car.dnfPosition);
        if (car.progress < car.dnfPosition) {
          allFinished = false;
        }
      } else {
        let finishTime = self.finishTimes[i];
        maxTime = Math.max(maxTime, finishTime);

        // Progress = elapsed / finishTime (0 to 1)
        car.progress = Math.min(1, elapsed / finishTime);

        if (car.progress >= 1 && !car.finished) {
          car.finished = true;
        }

        if (car.progress < 1) {
          allFinished = false;
        }
      }
    }

    self.draw();

    // Continue animation until all cars finished plus 1 second
    if (!allFinished || elapsed < maxTime + 1) {
      requestAnimationFrame(self.animate.bind(self));
    } else {
      self.animating = false;
      self.raceComplete = true;
      self.draw();
    }
  };

  // Get stream from canvas
  this.getStream = function(fps) {
    return self.canvas.captureStream(fps || 30);
  };

  // Start continuous render loop for streaming
  // captureStream needs continuous drawing to produce frames
  this.renderLoopRunning = false;
  this.startRenderLoop = function() {
    if (self.renderLoopRunning) return;
    self.renderLoopRunning = true;

    function renderFrame() {
      if (!self.renderLoopRunning) return;

      // Only draw if not in race animation (race animation handles its own drawing)
      if (!self.animating) {
        self.draw();
      }

      requestAnimationFrame(renderFrame);
    }

    requestAnimationFrame(renderFrame);
  };

  this.stopRenderLoop = function() {
    self.renderLoopRunning = false;
  };

  // Draw the track and cars
  this.draw = function() {
    let ctx = self.ctx;
    let width = self.canvas.width;
    let height = self.canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Calculate lane positions
    let totalLaneWidth = self.laneCount * self.laneWidth;
    let startX = (width - totalLaneWidth) / 2;

    // Draw track surface
    ctx.fillStyle = '#2d2d44';
    ctx.fillRect(startX - 10, self.startY - 10, totalLaneWidth + 20, self.trackLength + 20);

    // Draw lane dividers
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    for (let i = 0; i <= self.laneCount; i++) {
      let x = startX + i * self.laneWidth;
      ctx.beginPath();
      ctx.moveTo(x, self.startY);
      ctx.lineTo(x, self.finishY);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw start gate
    ctx.fillStyle = self.gateOpen ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(startX - 10, self.startY - 8, totalLaneWidth + 20, 6);

    // Draw finish line
    ctx.fillStyle = '#fff';
    for (let i = 0; i < totalLaneWidth + 20; i += 10) {
      if ((i / 10) % 2 === 0) {
        ctx.fillRect(startX - 10 + i, self.finishY, 10, 6);
      }
    }

    // Draw start line text
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('START', width / 2, self.startY - 15);

    // Draw finish line text
    ctx.fillText('FINISH', width / 2, self.finishY + 20);

    // Draw lane numbers
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    for (let i = 0; i < self.laneCount; i++) {
      let x = startX + i * self.laneWidth + self.laneWidth / 2;
      // When reversed, visual lane 0 = lane N, visual lane 1 = lane N-1, etc.
      let laneNum = self.reverseLanes ? (self.laneCount - i) : (i + 1);
      ctx.fillText(laneNum.toString(), x, height - 10);
    }

    // Draw cars
    for (let i = 0; i < self.cars.length; i++) {
      self.drawCar(i, startX);
    }

    // Draw elapsed time
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(self.elapsedDisplay.toFixed(3) + 's', width - 15, 30);

    // Draw race status
    ctx.textAlign = 'left';
    ctx.font = '14px sans-serif';
    let status = 'STAGING';
    let statusColor = '#888';
    if (self.gateOpen && !self.raceComplete) {
      status = 'RACING';
      statusColor = '#f1c40f';
    } else if (self.raceComplete) {
      status = 'FINISHED';
      statusColor = '#2ecc71';
    }
    ctx.fillStyle = statusColor;
    ctx.fillText(status, 15, 30);
  };

  // Draw a single car
  this.drawCar = function(index, startX) {
    let car = self.cars[index];
    let ctx = self.ctx;

    let x = startX + index * self.laneWidth + (self.laneWidth - self.carWidth) / 2;
    let yStart = self.startY + 10;
    let yRange = self.trackLength - self.carHeight - 20;
    let y = yStart + car.progress * yRange;

    // Car body
    if (!car.active) {
      ctx.fillStyle = '#333';
      ctx.globalAlpha = 0.3;
    } else if (car.dnf && car.progress >= car.dnfPosition - 0.01) {
      ctx.fillStyle = '#666';
      ctx.globalAlpha = 0.7;
    } else {
      ctx.fillStyle = car.color;
      ctx.globalAlpha = 1;
    }

    // Draw car shape (simplified race car)
    ctx.beginPath();
    ctx.moveTo(x + 5, y + self.carHeight);
    ctx.lineTo(x, y + self.carHeight - 5);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x + self.carWidth - 5, y);
    ctx.lineTo(x + self.carWidth, y + 8);
    ctx.lineTo(x + self.carWidth, y + self.carHeight - 5);
    ctx.lineTo(x + self.carWidth - 5, y + self.carHeight);
    ctx.closePath();
    ctx.fill();

    // Windshield
    ctx.fillStyle = '#222';
    ctx.fillRect(x + 8, y + 5, self.carWidth - 16, 8);

    // Draw car number on the car body
    if (car.carnumber !== null && car.active) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(car.carnumber, x + self.carWidth / 2, y + self.carHeight / 2 + 3);
      ctx.textBaseline = 'alphabetic';
    }

    // Reset alpha
    ctx.globalAlpha = 1;

    // Draw time for finished cars
    if (car.finished && car.time !== null) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(car.time.toFixed(3), x + self.carWidth / 2, y + self.carHeight + 14);
    }

    // Draw DNF label
    if (car.dnf && car.progress >= car.dnfPosition - 0.01) {
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DNF', x + self.carWidth / 2, y + self.carHeight + 14);
    }
  };

  // Initialize
  this.updateDimensions();
  this.initCars();
  this.draw();
}
