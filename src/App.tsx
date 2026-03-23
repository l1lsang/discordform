import {
  startTransition,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import {
  hasFirebaseConfig,
  submitCounselorApplication,
  subscribeCounselorApplications,
  updateCounselorApplication,
  type ApplicationStatus,
  type CounselorApplication,
  type CounselorApplicationInput,
} from './firebase'
import './App.css'

const qualities = [
  {
    title: '판단보다 경청',
    description: '빠른 해답보다 안정감 있는 대화 흐름을 우선하고, 끝까지 들어줄 수 있는 분을 기다립니다.',
  },
  {
    title: '운영 가능한 리듬',
    description: '꾸준히 참여할 수 있는 시간대와 응대 가능 빈도를 확인해 오래 함께할 분을 찾고 있어요.',
  },
  {
    title: '신뢰할 수 있는 태도',
    description: '민감한 이야기를 가볍게 소비하지 않고, 필요한 순간에는 운영진과 함께 움직일 수 있는 태도를 중요하게 봅니다.',
  },
] as const

const specialtyOptions = [
  '학업 · 진로',
  '인간관계',
  '연애 · 가족',
  '감정 기복 · 번아웃',
  '전반 응대 가능',
] as const

const activityOptions = [
  '주 2일 이하',
  '주 3일 정도',
  '주 4~5일',
  '거의 매일 가능',
  '일정이 유동적이에요',
] as const

const timeOptions = [
  {
    label: '평일 저녁형',
    description: '오후 7시 이후에 비교적 안정적으로 확인할 수 있어요.',
  },
  {
    label: '늦은 밤형',
    description: '야간 채널이나 새벽 시간대 응대에 강한 편입니다.',
  },
  {
    label: '오후 분산형',
    description: '오후 시간대에 짧게 여러 번 들어올 수 있어요.',
  },
  {
    label: '주말 집중형',
    description: '평일보다 주말에 길게 활동하는 편입니다.',
  },
] as const

const statusLabels: Record<ApplicationStatus, string> = {
  new: '새 지원',
  reviewing: '검토 중',
  approved: '합격',
  rejected: '보류',
}

const statusOptions = [
  { value: 'new', label: '새 지원' },
  { value: 'reviewing', label: '검토 중' },
  { value: 'approved', label: '합격' },
  { value: 'rejected', label: '보류' },
] as const satisfies ReadonlyArray<{ value: ApplicationStatus; label: string }>

type AppView = 'apply' | 'admin'
type FilterStatus = 'all' | ApplicationStatus

type SubmitState =
  | { phase: 'idle'; message: string }
  | { phase: 'submitting'; message: string }
  | { phase: 'success'; message: string }
  | { phase: 'error'; message: string }

type AdminDraft = {
  status: ApplicationStatus
  adminNote: string
}

const initialForm: CounselorApplicationInput = {
  nickname: '',
  age: '',
  discordId: '',
  intro: '',
  motivation: '',
  strengths: '',
  experience: '',
  specialty: '',
  timeWindow: '',
  activityDays: '',
  conflictResponse: '',
  finalNote: '',
  agreeCare: false,
  agreeRules: false,
}

const requiredFields = [
  'nickname',
  'age',
  'discordId',
  'motivation',
  'strengths',
  'experience',
  'specialty',
  'timeWindow',
  'activityDays',
  'conflictResponse',
] as const satisfies readonly (keyof CounselorApplicationInput)[]

const agreementFields = ['agreeCare', 'agreeRules'] as const satisfies readonly (keyof CounselorApplicationInput)[]

function getViewFromHash(): AppView {
  if (typeof window === 'undefined') {
    return 'apply'
  }

  return window.location.hash.replace('#', '') === 'admin' ? 'admin' : 'apply'
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return '방금 접수됨'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function App() {
  const firebaseConfigured = hasFirebaseConfig()
  const [view, setView] = useState<AppView>(() => getViewFromHash())
  const [form, setForm] = useState<CounselorApplicationInput>(initialForm)
  const [submitState, setSubmitState] = useState<SubmitState>({
    phase: 'idle',
    message: '',
  })
  const [applications, setApplications] = useState<CounselorApplication[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(firebaseConfigured)
  const [dashboardError, setDashboardError] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [adminDrafts, setAdminDrafts] = useState<Record<string, AdminDraft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    const syncView = () => {
      startTransition(() => {
        setView(getViewFromHash())
      })
    }

    if (!window.location.hash) {
      window.location.hash = 'apply'
    }

    syncView()
    window.addEventListener('hashchange', syncView)

    return () => {
      window.removeEventListener('hashchange', syncView)
    }
  }, [])

  useEffect(() => {
    if (!firebaseConfigured) {
      setDashboardLoading(false)
      return
    }

    setDashboardLoading(true)

    const unsubscribe = subscribeCounselorApplications(
      (nextApplications) => {
        setApplications(nextApplications)
        setDashboardLoading(false)
        setDashboardError('')
        setAdminDrafts((current) => {
          const nextDrafts = { ...current }

          for (const application of nextApplications) {
            nextDrafts[application.id] ??= {
              status: application.status,
              adminNote: application.adminNote,
            }
          }

          return nextDrafts
        })
      },
      () => {
        setDashboardError('지원서 목록을 불러오지 못했습니다.')
        setDashboardLoading(false)
      },
    )

    return unsubscribe
  }, [firebaseConfigured])

  const completionCount =
    requiredFields.filter((field) => String(form[field]).trim().length > 0).length +
    agreementFields.filter((field) => Boolean(form[field])).length
  const completionRate = Math.round(
    (completionCount / (requiredFields.length + agreementFields.length)) * 100,
  )

  const totalApplications = applications.length
  const newApplications = applications.filter((application) => application.status === 'new').length
  const reviewingApplications = applications.filter(
    (application) => application.status === 'reviewing',
  ).length
  const approvedApplications = applications.filter(
    (application) => application.status === 'approved',
  ).length

  const filteredApplications = applications.filter((application) => {
    const matchesStatus = filterStatus === 'all' || application.status === filterStatus
    const queryText = normalizeText(searchTerm)

    if (!queryText) {
      return matchesStatus
    }

    const searchPool = normalizeText(
      [
        application.nickname,
        application.discordId,
        application.specialty,
        application.motivation,
        application.strengths,
      ].join(' '),
    )

    return matchesStatus && searchPool.includes(queryText)
  })

  const navigate = (nextView: AppView) => {
    window.location.hash = nextView
  }

  const handleFormChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    const nextValue =
      event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
        ? event.target.checked
        : value

    setForm((current) => ({
      ...current,
      [name]: nextValue,
    }))

    setSubmitState((current) =>
      current.phase === 'submitting' ? current : { phase: 'idle', message: '' },
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!firebaseConfigured) {
      setSubmitState({
        phase: 'error',
        message: '현재 지원 접수 시스템을 점검하고 있습니다. 잠시 후 다시 시도해주세요.',
      })
      return
    }

    setSubmitState({
      phase: 'submitting',
      message: '지원서를 접수하고 있습니다.',
    })

    try {
      await submitCounselorApplication(form)
      setForm(initialForm)
      setSubmitState({
        phase: 'success',
        message: '지원서가 정상적으로 접수되었습니다. 검토 후 디스코드로 안내드릴게요.',
      })
    } catch {
      setSubmitState({
        phase: 'error',
        message: '접수 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
      })
    }
  }

  const handleAdminDraftChange = (
    id: string,
    field: keyof AdminDraft,
    value: ApplicationStatus | string,
  ) => {
    setAdminDrafts((current) => {
      const baseDraft: AdminDraft = current[id] ?? {
        status: 'new',
        adminNote: '',
      }

      return {
        ...current,
        [id]:
          field === 'status'
            ? {
                ...baseDraft,
                status: value as ApplicationStatus,
              }
            : {
                ...baseDraft,
                adminNote: value as string,
              },
      }
    })
  }

  const handleSaveApplication = async (id: string) => {
    if (!firebaseConfigured) {
      setDashboardError('관리 시스템 연결을 확인해주세요.')
      return
    }

    const draft = adminDrafts[id]

    if (!draft) {
      return
    }

    setSavingId(id)
    setDashboardError('')

    try {
      await updateCounselorApplication(id, draft)
    } catch {
      setDashboardError('상태 저장 중 문제가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__copy">
          <p className="eyebrow">Counselor Recruitment</p>
          <h1 className="topbar__title">서버의 분위기를 함께 지켜줄 상담사를 모집합니다.</h1>
          <p className="topbar__text">
            접수된 지원서는 운영진이 순차적으로 검토하며, 결과는 디스코드로 개별 안내드립니다.
          </p>
        </div>

        <nav className="mode-switch" aria-label="페이지 전환">
          <button
            className={`mode-switch__button ${view === 'apply' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate('apply')}
          >
            지원하기
          </button>
          <button
            className={`mode-switch__button ${view === 'admin' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate('admin')}
          >
            운영실
          </button>
        </nav>
      </header>

      {!firebaseConfigured && (
        <section className="setup-banner">
          <div>
            <p className="setup-banner__eyebrow">접수 안내</p>
            <h2>현재 상담사 지원 접수를 준비 중입니다.</h2>
            <p>
              접수 시스템 점검이 마무리되는 대로 지원이 다시 열릴 예정입니다. 잠시만 기다려주세요.
            </p>
          </div>
        </section>
      )}

      {view === 'apply' ? (
        <div className="apply-layout">
          <section className="story-panel">
            <p className="eyebrow">Discord 고민 서버 · Counselor Recruitment</p>
            <h2>누군가의 첫 고민을 차분하게 받아줄 상담사를 기다리고 있습니다.</h2>
            <p className="lead">
              고민을 가볍게 여기지 않고, 상대가 충분히 말할 수 있도록 기다려주는 분이라면 편하게
              지원해주세요. 활동 시간과 응대 스타일을 함께 확인해 더 잘 맞는 분과 오래 함께하고
              싶습니다.
            </p>

            <div className="quality-grid">
              {qualities.map((quality) => (
                <article className="quality-card" key={quality.title}>
                  <h3>{quality.title}</h3>
                  <p>{quality.description}</p>
                </article>
              ))}
            </div>

            <article className="highlight-card">
              <span className="highlight-card__label">운영 기준</span>
              <strong>경청, 비밀 보장, 꾸준한 참여</strong>
              <p>
                지원 내용은 운영진만 확인하며, 검토가 끝나면 디스코드 DM 또는 서버 내 안내로
                순차적으로 연락드립니다.
              </p>
            </article>
          </section>

          <section className="form-panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Application</p>
                <h2>상담사 지원 폼</h2>
                <p className="panel-copy">
                  지원 내용은 운영진이 검토하며, 활동 가능 시간과 응대 성향을 함께 확인합니다.
                </p>
              </div>

              <div className="completion-pill" aria-label={`작성 진척도 ${completionRate}퍼센트`}>
                <span>작성 진척도</span>
                <strong>{completionRate}%</strong>
              </div>
            </div>

            {submitState.phase !== 'idle' && (
              <div
                className={`status-banner status-banner--${submitState.phase}`}
                role={submitState.phase === 'error' ? 'alert' : 'status'}
              >
                {submitState.message}
              </div>
            )}

            <form className="application-form" onSubmit={handleSubmit}>
              <div className="field-grid">
                <label className="field">
                  <span>닉네임</span>
                  <input
                    name="nickname"
                    value={form.nickname}
                    onChange={handleFormChange}
                    placeholder="서버에서 사용하는 이름"
                    required
                  />
                </label>

                <label className="field">
                  <span>나이</span>
                  <input
                    name="age"
                    type="number"
                    value={form.age}
                    onChange={handleFormChange}
                    placeholder="예: 19"
                    required
                  />
                </label>

                <label className="field">
                  <span>디스코드 아이디</span>
                  <input
                    name="discordId"
                    value={form.discordId}
                    onChange={handleFormChange}
                    placeholder="예: example_1234"
                    required
                  />
                </label>

                <label className="field">
                  <span>주당 활동 가능 횟수</span>
                  <select
                    name="activityDays"
                    value={form.activityDays}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">선택해주세요</option>
                    {activityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>한 줄 소개</span>
                <input
                  name="intro"
                  value={form.intro}
                  onChange={handleFormChange}
                  placeholder="예: 차분하게 이야기를 끝까지 들어주는 편입니다."
                />
              </label>

              <label className="field">
                <span>지원하게 된 계기</span>
                <textarea
                  name="motivation"
                  value={form.motivation}
                  onChange={handleFormChange}
                  placeholder="왜 이 서버에서 상담사로 활동하고 싶은지 적어주세요."
                  required
                />
              </label>

              <label className="field">
                <span>본인의 강점 또는 상담 스타일</span>
                <textarea
                  name="strengths"
                  value={form.strengths}
                  onChange={handleFormChange}
                  placeholder="어떤 방식으로 유저와 대화하고 싶은지 적어주세요."
                  required
                />
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>상담 또는 운영 경험</span>
                  <select
                    name="experience"
                    value={form.experience}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">선택해주세요</option>
                    <option value="처음 지원해요">처음 지원해요</option>
                    <option value="소규모 서버 운영 경험이 있어요">
                      소규모 서버 운영 경험이 있어요
                    </option>
                    <option value="헬퍼/상담 비슷한 역할 경험이 있어요">
                      헬퍼/상담 비슷한 역할 경험이 있어요
                    </option>
                  </select>
                </label>

                <label className="field">
                  <span>주로 다루고 싶은 고민 분야</span>
                  <select
                    name="specialty"
                    value={form.specialty}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">선택해주세요</option>
                    {specialtyOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className="field-group">
                <legend>주 활동 시간대</legend>
                <div className="radio-grid">
                  {timeOptions.map((option) => (
                    <label
                      className={`radio-card ${form.timeWindow === option.label ? 'is-selected' : ''}`}
                      key={option.label}
                    >
                      <input
                        type="radio"
                        name="timeWindow"
                        value={option.label}
                        checked={form.timeWindow === option.label}
                        onChange={handleFormChange}
                        required
                      />
                      <span className="radio-card__title">{option.label}</span>
                      <span className="radio-card__description">{option.description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="field">
                <span>갈등 상황이나 감정적으로 힘든 유저를 만났을 때의 대응 방식</span>
                <textarea
                  name="conflictResponse"
                  value={form.conflictResponse}
                  onChange={handleFormChange}
                  placeholder="선 긋기, 운영진 호출 타이밍, 응대 원칙 등을 적어주세요."
                  required
                />
              </label>

              <label className="field">
                <span>운영진에게 전하고 싶은 말</span>
                <textarea
                  name="finalNote"
                  value={form.finalNote}
                  onChange={handleFormChange}
                  placeholder="일정, 특이사항, 추가로 봐줬으면 하는 점을 적어주세요."
                />
              </label>

              <div className="agreement-box">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="agreeCare"
                    checked={form.agreeCare}
                    onChange={handleFormChange}
                    required
                  />
                  <span>민감한 이야기와 개인정보를 가볍게 공유하지 않고 조심스럽게 다루겠습니다.</span>
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="agreeRules"
                    checked={form.agreeRules}
                    onChange={handleFormChange}
                    required
                  />
                  <span>서버 규칙과 운영진 안내를 우선으로 따르며, 어려운 상황은 바로 공유하겠습니다.</span>
                </label>
              </div>

              <div className="submit-row">
                <p>제출 후 운영진이 내용을 확인한 뒤 순차적으로 디스코드로 연락드립니다.</p>
                <button
                  className="submit-button"
                  type="submit"
                  disabled={!firebaseConfigured || submitState.phase === 'submitting'}
                >
                  {submitState.phase === 'submitting' ? '저장 중...' : '지원서 저장하기'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : (
        <div className="admin-layout">
          <section className="admin-hero">
            <div className="admin-hero__copy">
              <p className="eyebrow">Counselor Admin</p>
              <h2>접수 현황을 확인하고 지원자 검토 상태를 관리하세요.</h2>
              <p className="lead">
                새 지원 확인, 검토 상태 변경, 내부 메모 정리를 한곳에서 처리할 수 있습니다.
              </p>
            </div>

            <div className="stats-grid">
              <article className="stat-card">
                <span>전체 지원</span>
                <strong>{totalApplications}</strong>
              </article>
              <article className="stat-card">
                <span>새 지원</span>
                <strong>{newApplications}</strong>
              </article>
              <article className="stat-card">
                <span>검토 중</span>
                <strong>{reviewingApplications}</strong>
              </article>
              <article className="stat-card">
                <span>합격</span>
                <strong>{approvedApplications}</strong>
              </article>
            </div>
          </section>

          <section className="toolbar-card">
            <label className="field">
              <span>상태 필터</span>
              <select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value as FilterStatus)}
              >
                <option value="all">전체</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field toolbar-card__search">
              <span>검색</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="닉네임, 디스코드 아이디, 지원 계기"
              />
            </label>

            <div className="toolbar-note">변경한 상태와 메모는 저장 후 바로 운영 기록에 반영됩니다.</div>
          </section>

          {dashboardError && (
            <div className="status-banner status-banner--error" role="alert">
              {dashboardError}
            </div>
          )}

          <section className="admin-list">
            {dashboardLoading ? (
              <article className="empty-card">
                <h3>지원서를 불러오는 중입니다.</h3>
                <p>잠시만 기다려주세요.</p>
              </article>
            ) : filteredApplications.length === 0 ? (
              <article className="empty-card">
                <h3>조건에 맞는 지원서가 없습니다.</h3>
                <p>필터를 조정하거나 새 접수를 기다려주세요.</p>
              </article>
            ) : (
              filteredApplications.map((application) => {
                const adminDraft = adminDrafts[application.id] ?? {
                  status: application.status,
                  adminNote: application.adminNote,
                }

                return (
                  <article className="admin-card" key={application.id}>
                    <div className="admin-card__top">
                      <div>
                        <p className="admin-card__date">{formatDateTime(application.createdAt)}</p>
                        <h3>{application.nickname}</h3>
                        <p className="admin-card__meta">
                          {application.discordId} · {application.age}세
                        </p>
                      </div>

                      <span
                        className={`status-chip status-chip--${adminDraft.status}`}
                        aria-label={`현재 상태 ${statusLabels[adminDraft.status]}`}
                      >
                        {statusLabels[adminDraft.status]}
                      </span>
                    </div>

                    <div className="tag-row">
                      <span className="tag">{application.specialty}</span>
                      <span className="tag">{application.activityDays}</span>
                      <span className="tag">{application.timeWindow}</span>
                      <span className="tag">{application.experience}</span>
                      {application.agreeCare && application.agreeRules && (
                        <span className="tag">동의 완료</span>
                      )}
                    </div>

                    <div className="detail-grid">
                      <section className="detail-card">
                        <h4>지원 계기</h4>
                        <p>{application.motivation}</p>
                      </section>
                      <section className="detail-card">
                        <h4>강점 / 상담 스타일</h4>
                        <p>{application.strengths}</p>
                      </section>
                      <section className="detail-card">
                        <h4>갈등 대응 방식</h4>
                        <p>{application.conflictResponse}</p>
                      </section>
                      <section className="detail-card">
                        <h4>추가 메모</h4>
                        <p>{application.finalNote || '작성되지 않았어요.'}</p>
                      </section>
                    </div>

                    <div className="admin-actions">
                      <label className="field">
                        <span>검토 상태</span>
                        <select
                          value={adminDraft.status}
                          onChange={(event) =>
                            handleAdminDraftChange(
                              application.id,
                              'status',
                              event.target.value as ApplicationStatus,
                            )
                          }
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field admin-actions__note">
                        <span>관리자 메모</span>
                        <textarea
                          value={adminDraft.adminNote}
                          onChange={(event) =>
                            handleAdminDraftChange(application.id, 'adminNote', event.target.value)
                          }
                          placeholder="면접 DM 내용, 검토 포인트 등을 적어두세요."
                        />
                      </label>

                      <button
                        className="save-button"
                        type="button"
                        onClick={() => void handleSaveApplication(application.id)}
                        disabled={savingId === application.id || !firebaseConfigured}
                      >
                        {savingId === application.id ? '저장 중...' : '상태 저장'}
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
