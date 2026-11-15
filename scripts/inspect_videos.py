import cv2
import os

def analyze_video(path, name):
    print(f"=== Analyzing {name} ===")
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        print(f"Could not open video {path}")
        return
    fps = cap.get(cv2.CAP_PROP_FPS)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = count / fps if fps > 0 else 0
    print(f"Resolution: {w}x{h}, FPS: {fps:.2f}, Frames: {count}, Duration: {duration:.2f}s")
    
    out_dir = os.path.join("artifacts", "video_frames", name)
    os.makedirs(out_dir, exist_ok=True)
    
    # Extract frames at regular intervals or specific seconds
    sample_times = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0]
    for st in sample_times:
        if st > duration:
            break
        frame_idx = int(st * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if ret:
            out_path = os.path.join(out_dir, f"frame_{st:.1f}s.jpg")
            cv2.imwrite(out_path, frame)
            print(f"Saved {out_path}")
    cap.release()

if __name__ == "__main__":
    analyze_video("Multilingual Speech to Sign Language Translator (1).mp4", "ref_video")
    analyze_video(r"C:\Users\ACER\.gemini\antigravity\brain\f31398ab-e554-415c-a2d5-ccbc82647d07\.user_uploaded\media_1794624807483_e2073391.m4v", "fixloix")
