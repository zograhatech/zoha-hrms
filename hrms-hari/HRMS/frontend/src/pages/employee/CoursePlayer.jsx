import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../../api/axios';
import {
    FiChevronLeft, FiChevronRight, FiCheckCircle, FiCircle,
    FiPlay, FiFileText, FiClock, FiDownload, FiArrowLeft,
    FiMoreVertical, FiLayout, FiMaximize2, FiActivity, FiVideo, FiLink
} from 'react-icons/fi';

import { marked } from 'marked';

export default function CoursePlayer() {
    const { id: courseId } = useParams();
    const navigate = useNavigate();

    const [course, setCourse] = useState(null);
    const [enrollment, setEnrollment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentPos, setCurrentPos] = useState({ mIdx: 0, lIdx: 0 });
    const [msg, setMsg] = useState('');

    const loadCourse = async () => {
        setLoading(true);
        try {
            const res = await API.get(`/lms/course/${courseId}`);
            setCourse(res.data.data);
            setEnrollment(res.data.enrollment);
            
            // Resume from last position if exists
            if (res.data.enrollment?.lastLessonPos) {
                setCurrentPos(res.data.enrollment.lastLessonPos);
            }
        } catch (err) {
            setMsg('Course not found or unauthorized');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCourse();
    }, [courseId]);

    const activeLesson = course?.modules?.[currentPos.mIdx]?.lessons?.[currentPos.lIdx];

    const isLessonCompleted = (mIdx, lIdx) => {
        return enrollment?.completedLessons?.some(l => l.moduleIndex === mIdx && l.lessonIndex === lIdx);
    };

    const handleComplete = async () => {
        try {
            const res = await API.put(`/lms/progress/${courseId}`, {
                moduleIndex: currentPos.mIdx,
                lessonIndex: currentPos.lIdx
            });
            setEnrollment(res.data.data);
            
            // Move to next lesson automatically
            moveToNext();
        } catch (err) {
            console.error('Progress update failed', err);
        }
    };

    const moveToNext = () => {
        const mod = course.modules[currentPos.mIdx];
        if (currentPos.lIdx < mod.lessons.length - 1) {
            setCurrentPos({ ...currentPos, lIdx: currentPos.lIdx + 1 });
        } else if (currentPos.mIdx < course.modules.length - 1) {
            setCurrentPos({ mIdx: currentPos.mIdx + 1, lIdx: 0 });
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;
    if (msg) return <div className="p-12 text-center"><h3>{msg}</h3><button className="btn btn-outline" onClick={() => navigate('/dashboard/learning')}>Back to Learning</button></div>;

    return (
        <div className="course-player" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', height: 'calc(100vh - 100px)', gap: 0, margin: '-20px' }}>
            {/* Content Area */}
            <div className="player-content" style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', overflowY: 'auto' }}>
                <div style={{ padding: '20px 40px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 20 }}>
                     <button className="btn btn-icon btn-sm" onClick={() => navigate('/dashboard/learning')}><FiArrowLeft /></button>
                     <div>
                         <h2 style={{ fontSize: '1rem', margin: 0 }}>{course.title}</h2>
                         <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>M{currentPos.mIdx+1} · Lesson {currentPos.lIdx+1}</p>
                     </div>
                </div>

                <div className="player-body" style={{ flex: 1, padding: 40, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
                    {activeLesson?.type === 'video' ? (
                        <div style={{ aspectRatio: '16/9', background: '#000', borderRadius: 16, marginBottom: 30, overflow: 'hidden', position: 'relative' }}>
                             {activeLesson.videoUrl ? (
                                 activeLesson.videoUrl.includes('youtube.com') || activeLesson.videoUrl.includes('youtu.be') ? (
                                     <iframe 
                                        src={activeLesson.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')} 
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                        allowFullScreen
                                        title={activeLesson.title}
                                     />
                                 ) : (
                                     <video 
                                        src={activeLesson.videoUrl} 
                                        controls 
                                        style={{ width: '100%', height: '100%' }}
                                        className="player-video"
                                     />
                                 )
                             ) : (
                                 <div className="flex-center" style={{ height: 400, color: '#fff', fontSize: '1rem', flexDirection: 'column', gap: 10 }}>
                                     <FiPlay size={48} opacity={0.3} />
                                     <span>Video Placeholder Content</span>
                                 </div>
                             )}
                        </div>
                    ) : activeLesson?.type === 'quiz' ? (
                        <div className="quiz-content card" style={{ padding: 40, marginBottom: 30, textAlign: 'center' }}>
                             <FiLayout size={64} style={{ color: 'var(--accent-light)', marginBottom: 20 }} />
                             <h1 style={{ marginBottom: 16 }}>{activeLesson?.title}</h1>
                             
                             {activeLesson?.quizLink ? (
                                 <div style={{ maxWidth: 500, margin: '0 auto' }}>
                                     <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>This quiz is hosted on an external platform.</p>
                                     <a 
                                        href={activeLesson.quizLink} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="btn btn-primary"
                                        style={{ width: '100%', padding: 15, fontSize: '1rem' }}
                                     >
                                         Start Quiz <FiChevronRight />
                                     </a>
                                 </div>
                             ) : (
                                 <div style={{ maxWidth: 500, margin: '0 auto' }}>
                                     <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>System quiz integration is coming soon. Please complete other modules.</p>
                                     <button className="btn btn-primary" disabled style={{ width: '100%', padding: 15 }}>Launch System Quiz</button>
                                 </div>
                             )}
                        </div>
                    ) : (
                        <div className="reading-content card" style={{ padding: 30, marginBottom: 30, lineHeight: 1.8 }}>
                             <h1 style={{ marginBottom: 20 }}>{activeLesson?.title}</h1>
                             
                             {activeLesson?.docUrl ? (
                                 <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 16, border: '1px dashed var(--accent-light)' }}>
                                     <FiDownload size={48} style={{ color: 'var(--accent-light)', marginBottom: 20 }} />
                                     <h3 style={{ marginBottom: 10 }}>External Resource</h3>
                                     <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.9rem' }}>This lesson is hosted on an external platform or document.</p>
                                     <a 
                                        href={activeLesson.docUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="btn btn-primary"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                                     >
                                         <FiLink /> View Document / Article
                                     </a>
                                 </div>
                             ) : (
                                 <div 
                                    className="lesson-markdown"
                                    dangerouslySetInnerHTML={{ __html: marked.parse(activeLesson?.content || "No text content available for this lesson.", { breaks: true }) }}
                                 />
                             )}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 30 }}>
                        <button 
                            className="btn btn-outline" 
                            disabled={currentPos.mIdx === 0 && currentPos.lIdx === 0}
                            onClick={() => {
                                if (currentPos.lIdx > 0) setCurrentPos({...currentPos, lIdx: currentPos.lIdx - 1});
                                else if (currentPos.mIdx > 0) {
                                    const prevIdx = currentPos.mIdx - 1;
                                    setCurrentPos({ mIdx: prevIdx, lIdx: course.modules[prevIdx].lessons.length - 1});
                                }
                            }}
                        >
                            <FiChevronLeft /> Previous
                        </button>

                        <button 
                            className="btn btn-primary" 
                            onClick={handleComplete}
                            style={{ padding: '12px 30px', fontWeight: 700 }}
                        >
                            {isLessonCompleted(currentPos.mIdx, currentPos.lIdx) ? 'Completed' : 'Mark as Completed'} <FiCheckCircle style={{ marginLeft: 8 }} />
                        </button>

                        <button 
                            className="btn btn-outline" 
                            disabled={currentPos.mIdx === course.modules.length - 1 && currentPos.lIdx === course.modules[currentPos.mIdx].lessons.length - 1}
                            onClick={moveToNext}
                        >
                            Next <FiChevronRight />
                        </button>
                    </div>
                </div>
            </div>

            {/* Sidebar Navigation */}
            <div className="player-sidebar" style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', overflowY: 'auto' }}>
                 <div style={{ padding: 20, borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: '0.9rem' }}>
                     Course Content
                 </div>
                 {course.modules.map((mod, mIdx) => (
                     <div key={mod._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                         <div style={{ padding: '12px 20px', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{mod.title}</span>
                             <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{mod.lessons.length} Lessons</span>
                         </div>
                         {mod.lessons.map((lesson, lIdx) => {
                             const isActive = currentPos.mIdx === mIdx && currentPos.lIdx === lIdx;
                             const isCompleted = isLessonCompleted(mIdx, lIdx);
                             return (
                                 <div 
                                    key={lIdx} 
                                    className={`sidebar-lesson ${isActive ? 'active' : ''}`}
                                    onClick={() => setCurrentPos({ mIdx, lIdx })}
                                    style={{ padding: '12px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, borderLeft: isActive ? '3px solid var(--accent-light)' : '3px solid transparent' }}
                                 >
                                    <div style={{ color: isCompleted ? '#22c55e' : 'var(--text-muted)' }}>
                                        {isCompleted ? <FiCheckCircle size={14} /> : (isActive ? <FiPlay size={14} /> : <FiCircle size={14} />)}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: isActive ? 'var(--accent-light)' : 'var(--text-primary)', fontWeight: isActive ? 700 : 500 }}>
                                        {lesson.title}
                                    </div>
                                    <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                        {lesson.type === 'video' ? <FiVideo size={12} /> : <FiFileText size={12} />}
                                    </div>
                                 </div>
                             );
                         })}
                     </div>
                 ))}
                 
                 <div style={{ padding: 20 }}>
                      <div className="progress-container" style={{ background: 'var(--bg-primary)', padding: 15, borderRadius: 12, border: '1px solid var(--border-color)' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 8, fontWeight: 700 }}>
                               <span>Overall Progress</span>
                               <span>{enrollment?.progress || 0}%</span>
                           </div>
                           <div style={{ height: 6, width: '100%', background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${enrollment?.progress || 0}%`, background: 'var(--gradient-primary)' }}></div>
                           </div>
                      </div>
                 </div>
            </div>

            <style>{`
                .sidebar-lesson { transition: background 0.2s; border-bottom: 1px solid rgba(0,0,0,0.05); }
                .sidebar-lesson:hover { background: var(--bg-primary); }
                .sidebar-lesson.active { background: rgba(var(--accent-rgb), 0.05); }
                .player-video { box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
                .lesson-markdown { white-space: pre-wrap; }
                .lesson-markdown h1, .lesson-markdown h2, .lesson-markdown h3 { margin: 24px 0 16px; color: var(--text-primary); }
                .lesson-markdown p { margin-bottom: 16px; line-height: 1.8; color: var(--text-secondary); }
                .lesson-markdown ul, .lesson-markdown ol { margin: 0 0 16px 20px; color: var(--text-secondary); }
                .lesson-markdown li { margin-bottom: 8px; }
                .lesson-markdown strong { color: var(--text-primary); }
                .lesson-markdown blockquote { border-left: 4px solid var(--accent-light); padding-left: 16px; margin: 0 0 16px; font-style: italic; color: var(--text-muted); }
            `}</style>
        </div>
    );
}

