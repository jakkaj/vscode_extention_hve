**Condensed Specification: React + Python DETR Object Detection Web App**

---

## 1. Overview
- A local **React + TypeScript** app (built with **Vite**) for uploading an image and running **DETR (ResNet-50)** object detection.
- Runs inside a **Dev Container** (Docker + VS Code) that provides both **Node.js** and **Python**.
- **No separate server** like Flask/FastAPI; instead, **Node** directly calls the **Python** script via `child_process`.
- All files (input/output images) are stored temporarily (no persistent storage).
- A **Makefile** is included for running the Python detection script independently.

---

## 2. Frontend (React + TypeScript with Vite)
### UI & Components
- **Image Upload**: A simple file input (`<input type="file">`) that immediately displays the chosen image (via an `ObjectURL`) and triggers processing.
- **Loading Spinner**: Shown while the Python script processes the image.
- **Original & Processed Images**: Display them side by side or stacked (responsive). The processed image shows bounding boxes (drawn in the backend).
- **Minimal, Modern Design**: Use **vanilla CSS** or **CSS Modules**—no Tailwind. Keep a clean layout with basic Flex/Grid.
- **State Management**: 
  - `originalImgSrc` for preview,
  - `processedImgSrc` for the detection result,
  - `isLoading` to handle spinner,
  - optional `error` for failures.

### Workflow
1. User selects an image -> preview appears.
2. The app sends the file to the backend (`/api/detect` or similar).
3. Spinner appears until processing is done.
4. When the backend returns the output path, the frontend sets `processedImgSrc` to display the result.

---

## 3. Backend (Python DETR Inference Script)
- **Script Name**: e.g., `detect.py`.
- **Model**: Use **facebook/detr-resnet-50** (Hugging Face `DetrForObjectDetection` + `DetrImageProcessor`, or `torchvision` DETR).
- **Operation**:
  1. Accepts an input image path and an output path as arguments.
  2. Loads the DETR model once (model could be initialized at script start).
  3. Performs inference to get bounding boxes and class labels.
  4. Draws boxes (and optionally labels) on the image using PIL or OpenCV.
  5. Saves the processed image to the specified output path.
  6. Prints or returns the output path (then exits).

---

## 4. Integration (Node + Child Process)
- **Local Endpoint**: A small Node-based route (e.g., via Express or Vite middleware) handles `POST /api/detect`:
  1. Receives the uploaded file (via `FormData`).
  2. Saves it to a temporary location (e.g., `./temp/input.jpg`).
  3. Calls the Python script: `python detect.py input.jpg output.jpg`.
  4. Waits for completion; on success, returns `{ outputPath: "/temp/output.jpg" }`.
- **Serving Result**: 
  - Mark the `temp/` folder as static so the browser can fetch `output.jpg` directly.
  - The React frontend sets the result `<img src>` to that path.
- **Error Handling**: If the script fails (non-zero exit), return a 500 response and show an error in the frontend.

---

## 5. Dev Container & Makefile
- **Dev Container**: 
  - Dockerfile with **Node.js** + **Python** + dependencies (`torch`, `transformers`, `Pillow`, etc.).
  - `.devcontainer/devcontainer.json` config for VS Code (port forwarding, etc.).
  - Run `npm install` (front-end deps) and `pip install` or `requirements.txt` (Python deps).
- **Makefile**: 
  - A `run-inference` target to test the script standalone: `make run-inference input=sample.jpg`.
  - This calls `python detect.py sample.jpg output.jpg`, prints the output path, and helps validate the detection logic without the React UI.

---

**Summary**:  
Users open the React app (served by Vite/Node in the dev container), upload an image, and see bounding-box detections from the DETR model. The Node process calls the Python script to generate the annotated image, which is returned and displayed. All dependencies are isolated in the container, and a Makefile target exists for quick CLI testing. This setup provides a straightforward, local-only object detection demo without persistent storage or heavy server frameworks.