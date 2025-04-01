#include <PID_v1.h>

#define PWM 10
#define PHASE1 2
#define PHASE2 3

// Thermistor setup
int Vi = 1023;
float R1 = 22000;
float logR2 = 0;
float T = 0;
float c1 = -1.185559046e-03;
float c2 = 5.505203063e-04;
float c3 = -9.653138374e-07;

// PID variables
double input = 0, output = 0, init_setpoint = 32.5, setpoint = init_setpoint, targetTemp = setpoint;
double Kp = 128, Ki = 8, Kd = 16;

PID myPID(&input, &output, &setpoint, Kp, Ki, Kd, DIRECT);

// State variables
unsigned long startTime = 0;
bool receivedCommand = false;

void setup() {
  pinMode(PWM, OUTPUT);
  pinMode(PHASE1, OUTPUT);
  pinMode(PHASE2, OUTPUT);

  myPID.SetMode(AUTOMATIC);
  myPID.SetOutputLimits(-255, 255);

  Serial.begin(115200);
  Serial.println("READY");
}

void loop() {
  if (Serial.available() > 0) {
    String inputString = Serial.readStringUntil('\n');
    ProcessCommand(inputString);
  }

  if (receivedCommand) {
    MaintainTemperature(setpoint);
  }
}

void ProcessCommand(String command) {
  double newSetpointChange = command.toDouble();
  if (isnan(newSetpointChange)) {
    Serial.println("Invalid number format. Ignoring command.");
    return;
  }

  targetTemp = init_setpoint + newSetpointChange;
  setpoint = targetTemp;
  myPID.SetTunings(Kp, Ki, Kd);
  receivedCommand = true;

  Serial.print("Target Temperature: ");
  Serial.print(targetTemp);
  Serial.println(" degC");
}

void MaintainTemperature(double targetTemp) {
  setpoint = targetTemp;
  AdjustTemperature();
  delay(10);  // fast update for continuous control
}

void AdjustTemperature() {
  input = ReadTemperature();
  myPID.Compute();

  if (input < setpoint) {
    digitalWrite(PHASE1, LOW);
    digitalWrite(PHASE2, HIGH);
    analogWrite(PWM, abs(output));
    LogData("HEATING", false, output);
  } else {
    digitalWrite(PHASE1, HIGH);
    digitalWrite(PHASE2, LOW);
    analogWrite(PWM, abs(output));
    LogData("COOLING", true, output);
  }
}

double ReadTemperature() {
  int Vo = analogRead(A0);
  float R2 = R1 * (Vi / (float)Vo - 1);
  logR2 = log(R2);
  T = (1.0 / (c1 + c2 * logR2 + c3 * logR2 * logR2 * logR2)) - 273.15;
  return T;
}

void LogData(String status, bool cooling, double pwmValue) {
  double currentKp = Kp;
  double temperatureChange = targetTemp - init_setpoint;
  double targetTemp_text = targetTemp;

  myPID.SetTunings(currentKp, Ki, Kd);

  String time = GetTimeMs();
  String message = time + "," + String(currentKp) + "," + String(Ki) + "," + String(Kd) + "," +
                   String(input, 2) + "," + String(targetTemp_text) + "," + String(pwmValue, 2) + "," +
                   String(temperatureChange, 2) + ",0,0;";
  Serial.println(message);
}

String GetTimeMs() {
  return String(millis() - startTime);
}