import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { FiSmile, FiPieChart, FiHash, FiClock, FiUser, FiZap, FiActivity, FiMessageSquare } from 'react-icons/fi';
import { formatDate } from '../../utils/dateFormatter';

export default function FunSummary() {
    const [summaries, setSummaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        API.get('/fun/summary')
            .then(res => {
                setSummaries(Array.isArray(res.data.summaries) ? res.data.summaries : []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Fun summary error:', err);
                setError(err.response?.data?.message || 'Failed to fetch fun summaries.');
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    const jokes = summaries.filter(s => s.type === 'joke');
    const ideas = summaries.filter(s => s.type === 'idea');
    const suggestions = summaries.filter(s => s.type === 'suggestion');

    return (
        <div className="fun-summary-page p-24">
            <div className="page-header">
                <div>
                    <h1 className="page-title"><FiSmile className="text-yellow-500" /> Thursday Fun Summary</h1>
                    <p className="page-subtitle">Employee jokes, ideas, and suggestions from the most recent Thursday.</p>
                </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="summary-grid mt-24">
                {/* Jokes Section */}
                <div className="summary-card joke-card">
                    <div className="card-header"><FiZap /> Jokes ({jokes.length})</div>
                    <div className="card-body">
                        {jokes.length === 0 ? <p className="empty-text">No jokes shared yet.</p> : jokes.map(j => (
                            <div key={j._id} className="fun-item">
                                <p>"{j.content}"</p>
                                <div className="fun-meta"><FiUser /> {j.employeeName} • <FiClock /> {formatDate(j.createdAt)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Ideas Section */}
                <div className="summary-card idea-card">
                    <div className="card-header"><FiActivity /> Productive Ideas ({ideas.length})</div>
                    <div className="card-body">
                        {ideas.length === 0 ? <p className="empty-text">No ideas shared yet.</p> : ideas.map(i => (
                            <div key={i._id} className="fun-item">
                                <p>"{i.content}"</p>
                                <div className="fun-meta"><FiUser /> {i.employeeName} • <FiClock /> {formatDate(i.createdAt)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Suggestions Section */}
                <div className="summary-card suggestion-card">
                    <div className="card-header"><FiMessageSquare /> Suggestions ({suggestions.length})</div>
                    <div className="card-body">
                        {suggestions.length === 0 ? <p className="empty-text">No suggestions shared yet.</p> : suggestions.map(s => (
                            <div key={s._id} className="fun-item">
                                <p>"{s.content}"</p>
                                <div className="fun-meta"><FiUser /> {s.employeeName} • <FiClock /> {formatDate(s.createdAt)}</div>
 drum                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <style jsx="true">{`
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                    gap: 24px;
                }

                .summary-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-xl);
                    overflow: hidden;
                    box-shadow: var(--shadow-sm);
                }

                .card-header {
                    padding: 16px 20px;
                    font-weight: 800;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    border-bottom: 2px solid var(--bg-secondary);
                }

                .joke-card .card-header { background: #fef9c3; color: #854d0e; }
                .idea-card .card-header { background: #dcfce7; color: #166534; }
                .suggestion-card .card-header { background: #dbeafe; color: #1e40af; }

                .card-body {
                    padding: 20px;
                    max-height: 500px;
                    overflow-y: auto;
                }

                .fun-item {
                    padding: 12px;
                    border-bottom: 1px solid var(--border-color);
                    margin-bottom: 12px;
                }

                .fun-item:last-child { border-bottom: none; }

                .fun-item p {
                    font-size: 0.95rem;
                    color: var(--text-primary);
                    margin-bottom: 8px;
                    font-style: italic;
                    line-height: 1.5;
                }

                .fun-meta {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }

                .empty-text {
                    text-align: center;
                    color: var(--text-muted);
                    padding: 20px;
                    font-size: 0.85rem;
                }
            `}</style>
        </div>
    );
}
