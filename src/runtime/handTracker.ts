import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { emptyHand, handFromLandmarks, type Hands, type Landmark } from './gestureEngine'

// The same model the SDK downloads (glasscube/vision/landmark_detector.py).
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let landmarkerPromise: Promise<HandLandmarker> | null = null

export function loadHandLandmarker(): Promise<HandLandmarker> {
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe')
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO' as const,
      numHands: 2,
    })
    try {
      return await HandLandmarker.createFromOptions(fileset, options('GPU'))
    } catch {
      return await HandLandmarker.createFromOptions(fileset, options('CPU'))
    }
  })()
  landmarkerPromise.catch(() => (landmarkerPromise = null))
  return landmarkerPromise
}

// Hands as the mirror sees them. The SDK flips each frame (cv2.flip) and swaps MediaPipe's
// handedness; feeding the raw camera frame and mirroring x gives the same result.
export function detectHands(landmarker: HandLandmarker, video: HTMLVideoElement, timestampMs: number): Hands {
  const result = landmarker.detectForVideo(video, timestampMs)
  const hands: Hands = { left: emptyHand(), right: emptyHand() }
  result.landmarks.forEach((landmarks, i) => {
    const label = result.handedness[i]?.[0]?.categoryName?.toLowerCase()
    if (label !== 'left' && label !== 'right') return
    const mirrored: Landmark[] = landmarks.map((p) => [1 - p.x, p.y, p.z])
    hands[label] = handFromLandmarks(mirrored)
  })
  return hands
}
