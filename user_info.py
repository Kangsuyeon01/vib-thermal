import csv
import os
import csv
import os

def save_user_info(name, experiment_id, gender):
    os.makedirs("static/save_data", exist_ok=True)
    file_path = "static/save_data/users.csv"

    existing_user = False
    trial_number = 1

    # 사용자 정보 확인
    if os.path.exists(file_path):
        with open(file_path, "r", newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row["experiment_id"] == experiment_id:
                    if row["name"] != name:
                        return False, None  # 이름-ID 불일치 시 오류
                    existing_user = True
                    break

    # 사용자 디렉토리에서 trial 개수 확인
    user_dir = f"static/save_data/{experiment_id}"
    if os.path.exists(user_dir):
        trial_number = len([f for f in os.listdir(user_dir) if f.endswith("_collected_data.json")]) + 1
    else:
        os.makedirs(user_dir + "/logs", exist_ok=True)

    # 새 사용자라면 csv에 추가
    if not existing_user:
        with open(file_path, "a", newline='') as f:
            writer = csv.DictWriter(f, fieldnames=["name", "experiment_id", "gender"])
            if f.tell() == 0:
                writer.writeheader()
            writer.writerow({
                "name": name,
                "experiment_id": experiment_id,
                "gender": gender
            })

    return True, trial_number
