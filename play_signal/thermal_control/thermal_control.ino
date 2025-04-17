#include <PID_v1.h>

#define PWM 10
#define PHASE1 2
#define PHASE2 3

int Vi = 1023;
float R1 = 22000;
float T = 0;
float c1 = -1.185559046e-03;
float c2 = 5.505203063e-04;
float c3 = -9.653138374e-07;

double input = 0, output = 0;
double init_setpoint = 32.5;
double setpoint = init_setpoint;
double Kp = 32, Ki = 2, Kd = 16; // 기본 Kp를 32로 설정

PID myPID(&input, &output, &setpoint, Kp, Ki, Kd, DIRECT);

String serialBuffer = "";
unsigned long startTime = 0;
bool started = false;

void setup() {
  Serial.begin(115200);
  pinMode(PWM, OUTPUT);
  pinMode(PHASE1, OUTPUT);
  pinMode(PHASE2, OUTPUT);

  myPID.SetMode(AUTOMATIC);
  myPID.SetOutputLimits(-255, 255);

  Serial.println("READY");
}

void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      serialBuffer.trim();
      if (serialBuffer.equalsIgnoreCase("start")) {
        startTime = millis();
        started = true;
        Kp = 128;  // 시작 시 Kp 변경
        myPID.SetTunings(Kp, Ki, Kd);
        Serial.println("Start received. Kp set to 128.");
      } else if (serialBuffer.equalsIgnoreCase("end")) {
        Kp = 32;  // 종료 시 Kp 복원
        myPID.SetTunings(Kp, Ki, Kd);
        Serial.println("End received. Kp reset to 32.");
      } else if (serialBuffer.length() > 0) {
        double delta = serialBuffer.toFloat();
        setpoint = init_setpoint + delta;
        Serial.print("Delta Received: ");
        Serial.println(delta);
      }
      serialBuffer = "";
    } else {
      serialBuffer += c;
    }
  }

  input = ReadTemperature();
  myPID.Compute();

  double pwmValue = abs(output);
  digitalWrite(PHASE1, input < setpoint ? LOW : HIGH);
  digitalWrite(PHASE2, input < setpoint ? HIGH : LOW);
  analogWrite(PWM, pwmValue);

  if (started) {
    LogData(pwmValue);
  }

  delay(100);  // 10Hz
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
                   String(delta, 2) + "," +
                   String(pwmValue, 2) + "," +
                   "Received:" + String(delta, 2);
  Serial.println(message);
}
