var Service, Characteristic;
var Denon = require('denon-client');

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-denon-avr', 'DenonAVR', denonClient);
};

function denonClient(log, config) {
  this.log = log;

  // configuration
  this.config = config;
  this.name = config['name'];
  this.ip = config['ip'];

  this.requiredInput = config['input'] || false;
  this.debug = config['debug'] || false;

  // state variables
  this.avr = new Denon.DenonClient(this.ip);
  this.currentPowerState = 'OFF';
  this.currentInput = '';

  // listeners
  this.avr.on('inputChanged', (newInput) => {
    this.currentInput = newInput;
    this.log(`Input changed to: ${newInput}`);
  });
  this.avr.on('powerChanged', (newPowerState) => {
    this.currentPowerState = newPowerState;
    this.log(`powerState changed to: ${newPowerState}`);
  });

  // inital values
  this.avr.connect()
    .then(() => {
      this.log(`Tryin to get Input`);
      return this.avr.getInput()
    })
    .then((result) => {
      this.log(`Current input retrieved as: ${result}`);
      this.currentInput = result;
    })
    .catch((error) => {
      this.log('Error %s', error);
    });

  this.avr.connect()
    .then(() => {
      this.log(`Tryin to get power state`);
      return this.avr.getPower()
    })
    .then((result) => {
      this.log(`Current power retrieved as: ${result}`);
      this.currentPowerState = result;
    })
    .catch((error) => {
      this.log('Error %s', error);
    });
}

denonClient.prototype.getPowerState = function (callback, context) {
  this.log('getPowerState: %s', this.currentPowerState);
  callback(null, (this.currentPowerState == 'ON'));
};

denonClient.prototype.setPowerState = function (powerState, callback, context) {
  this.log('setPowerState to: %s', powerState);
  this.avr.connect()
  .then(() => {
    this.log('Connected.');
    return this.avr.setPower((powerState) ? 'ON' : 'OFF');
  })
  .then(() => {
    this.log('Powerstate has been set to %s', this.powerState);
    this.currentPowerState = powerState;

    if(powerState && this.currentInput != this.requiredInput) {
      this.log('setting Input to %s', this.requiredInput);
      return this.avr.setInput(this.requiredInput);
    }
  })
  .catch((error) => {
      // Oh noez.
      this.log('Error %s', error);
  });

  callback(null);
};

denonClient.prototype.getServices = function () {
  var informationService = new Service.AccessoryInformation();

  informationService
    .setCharacteristic(Characteristic.Name, this.name)
    .setCharacteristic(Characteristic.Manufacturer, this.type || 'denon');

  // This is a switch that is on only if the avr is on && the input is correct.
  this.homebridgeService = new Service.Switch(this.name);
  this.homebridgeService.getCharacteristic(Characteristic.On)
    .on('get', this.getPowerState.bind(this))
    .on('set', this.setPowerState.bind(this));

  return [informationService, this.homebridgeService];
};