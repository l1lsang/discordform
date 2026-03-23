import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'

export type ApplicationStatus = 'new' | 'reviewing' | 'approved' | 'rejected'

export type CounselorApplicationInput = {
  nickname: string
  age: string
  discordId: string
  intro: string
  motivation: string
  strengths: string
  experience: string
  specialty: string
  timeWindow: string
  activityDays: string
  conflictResponse: string
  finalNote: string
  agreeCare: boolean
  agreeRules: boolean
}

export type CounselorApplication = CounselorApplicationInput & {
  id: string
  status: ApplicationStatus
  adminNote: string
  createdAt: Date | null
}

export const firebaseEnvKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const firebaseConfigured = firebaseEnvKeys.every((key) => Boolean(import.meta.env[key]))
const firebaseApp = firebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null

const firestore = firebaseApp ? getFirestore(firebaseApp) : null
const applicationsCollection = 'counselorApplications'

function parseDate(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate() as Date
  }

  return null
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return value === 'new' || value === 'reviewing' || value === 'approved' || value === 'rejected'
}

function mapSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): CounselorApplication {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    nickname: String(data.nickname ?? ''),
    age: String(data.age ?? ''),
    discordId: String(data.discordId ?? ''),
    intro: String(data.intro ?? ''),
    motivation: String(data.motivation ?? ''),
    strengths: String(data.strengths ?? ''),
    experience: String(data.experience ?? ''),
    specialty: String(data.specialty ?? ''),
    timeWindow: String(data.timeWindow ?? ''),
    activityDays: String(data.activityDays ?? ''),
    conflictResponse: String(data.conflictResponse ?? ''),
    finalNote: String(data.finalNote ?? ''),
    agreeCare: Boolean(data.agreeCare),
    agreeRules: Boolean(data.agreeRules),
    status: isApplicationStatus(data.status) ? data.status : 'new',
    adminNote: String(data.adminNote ?? ''),
    createdAt: parseDate(data.createdAt),
  }
}

function requireFirestore() {
  if (!firestore) {
    throw new Error('Firebase 환경변수가 비어 있어 Firestore를 사용할 수 없어요.')
  }

  return firestore
}

export function hasFirebaseConfig() {
  return firebaseConfigured
}

export async function submitCounselorApplication(data: CounselorApplicationInput) {
  const db = requireFirestore()
  const snapshot = await addDoc(collection(db, applicationsCollection), {
    ...data,
    status: 'new' satisfies ApplicationStatus,
    adminNote: '',
    createdAt: serverTimestamp(),
  })

  return snapshot.id
}

export function subscribeCounselorApplications(
  onData: (applications: CounselorApplication[]) => void,
  onError: (error: Error) => void,
) {
  const db = requireFirestore()
  const applicationsQuery = query(
    collection(db, applicationsCollection),
    orderBy('createdAt', 'desc'),
  )

  return onSnapshot(
    applicationsQuery,
    (snapshot) => {
      onData(snapshot.docs.map(mapSnapshot))
    },
    (error) => {
      onError(error)
    },
  )
}

export async function updateCounselorApplication(
  id: string,
  updates: Pick<CounselorApplication, 'status' | 'adminNote'>,
) {
  const db = requireFirestore()
  await updateDoc(doc(db, applicationsCollection, id), updates)
}
