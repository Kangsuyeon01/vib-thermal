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
double input = 0, output = 0;
double init_setpoint = 32.5;
double setpoint = init_setpoint;
double Kp = 128, Ki = 8, Kd = 16;

PID myPID(&input, &output, &setpoint, Kp, Ki, Kd, DIRECT);

String serialBuffer = "";
unsigned long lastReceiveTime = 0;
unsigned long startTime = 0;

// duration 설정 (예: Python에서 5초간 보낸다고 하면)
unsigned long durationMs = 5000;
bool finished = false;

void setup() {
  Serial.begin(115200);

  pinMode(PWM, OUTPUT);
  pinMode(PHASE1, OUTPUT);
  pinMode(PHASE2, OUTPUT);

  myPID.SetMode(AUTOMATIC);
  myPID.SetOutputLimits(-255, 255);

  Serial.println("READY");
  startTime = millis();
  lastReceiveTime = millis();
}

void loop() {
  // 수신 처리
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      serialBuffer.trim();
      if (serialBuffer.length() > 0) {
        double delta = serialBuffer.toFloat();
        setpoint = init_setpoint + delta;
        lastReceiveTime = millis();  // 수신 시간 갱신
        finished = false;

        Serial.print("📥 Delta Received: ");
        Serial.print(delta);
        Serial.print(" → Setpoint: ");
        Serial.println(setpoint);
      }
      serialBuffer = "";
    } else {
      serialBuffer += c;
    }
  }

  // duration 후 자동 복귀
  if (!finished && millis() - lastReceiveTime > durationMs) {
    Serial.println("⏱ Duration passed. Returning to init_setpoint.");
    setpoint = init_setpoint;
    finished = true;
  }

  // PID 제어
  input = ReadTemperature();
  myPID.Compute();

  double pwmValue = abs(output);
  if (input < setpoint) {
    digitalWrite(PHASE1, LOW);
    digitalWrite(PHASE2, HIGH);
  } else {
    digitalWrite(PHASE1, HIGH);
    digitalWrite(PHASE2, LOW);
  }
  analogWrite(PWM, pwmValue);

  LogData(pwmValue);
  delay(10);  // 100Hz
}

double ReadTemperature() {
  int Vo = analogRead(A0);
  if (Vo <= 0) return -999.0;
  float R2 = R1 * (Vi / (float)Vo - 1.0);
  float logR2 = log(R2);
  T = (1.0 / (c1 + c2 * logR2 + c3 * pow(logR2, 3))) - 273.15;
  return T;
}

void LogData(double pwmValue) {
  double delta = setpoint - init_setpoint;
  String time = String(millis() - startTime);
  String message = time + "," +
                   String(input, 2) + "," +
                   String(setpoint, 2) + "," +
                   String(delta, 2);
  Serial.println(message);
}
