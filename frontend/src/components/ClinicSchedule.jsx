
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApi } from '../api/client';
import PeriodSelector from './PeriodSelector';
import './ClinicSchedule.css';

const START_H = 7;
const END_H = 20;
const SLOT_H = 60; // px per hour
const PX_PER_MIN = SLOT_H / 60;

const COLORS = [
  { bg: '#f97316', dc: 'dc-orange' },
  { bg: '#3b82f6', dc: 'dc-blue' },
  { bg: '#a855f7', dc: 'dc-purple' },
  { bg: '#14b8a6', dc: 'dc-teal' },
  { bg: '#22c55e', dc: 'dc-green' },
  { bg: '#ef4444', dc: 'dc-red' },
];

export default function ClinicSchedule({ api: injectedApi }) {
  const defaultApi = useApi();
  // Memoize api to prevent infinite loops in useEffect
  const api = useMemo(() => injectedApi || defaultApi, [injectedApi]); // defaultApi is unstable, but we can ignore it if we assume useApi is stateless
  
  const storedView = localStorage.getItem("globalPeriod") || 'day';
  const initialView = ['day', 'week'].includes(storedView) ? storedView : 'day';

  const [date, setDate] = useState(new Date());
  const [view, setView] = useState(initialView); // Sync initial state
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [visibleStaff, setVisibleStaff] = useState(new Set());
  const [loading, setLoading] = useState(false);
  
  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null); // null = new
  const [modalForm, setModalForm] = useState({
    staff_id: '',
    start_time: '09:00',
    end_time: '17:00',
    note: ''
  });

  // Active Staff Modal State
  const [activeStaffModal, setActiveStaffModal] = useState({
    isOpen: false,
    time: null,
    staffList: []
  });

  // Listen for period changes from Layout
  useEffect(() => {
    const handler = (event) => {
        if (event.detail && event.detail.period && ['day', 'week'].includes(event.detail.period)) {
            setView(event.detail.period);
        }
    };
    window.addEventListener("periodChanged", handler);
    return () => window.removeEventListener("periodChanged", handler);
  }, []);

  // Fetch Staff
  const fetchStaff = useCallback(async () => {
    try {
      const data = await api.get('/staff');
      // Show all active staff for scheduling
      const activeStaff = data.filter(s => s.is_active).map((s, i) => ({
        ...s,
        color: COLORS[i % COLORS.length].bg,
        dc: COLORS[i % COLORS.length].dc,
        initials: `${s.first_name[0]}${s.last_name[0]}`
      }));
      setStaff(activeStaff);
      setVisibleStaff(new Set(activeStaff.map(s => s.id)));
      if (activeStaff.length > 0 && !modalForm.staff_id) {
        setModalForm(prev => ({ ...prev, staff_id: activeStaff[0].id }));
      }
    } catch (err) {
      console.error("Failed to fetch staff", err);
    }
  }, [api]); // api is now stable-ish

  // Fetch Shifts
  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const startOfPeriod = new Date(date);
      const endOfPeriod = new Date(date);

      if (view === 'day') {
        startOfPeriod.setHours(0, 0, 0, 0);
        endOfPeriod.setHours(23, 59, 59, 999);
      } else if (view === 'week') {
        const day = startOfPeriod.getDay(); // 0 (Sun) - 6 (Sat)
        const diff = startOfPeriod.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Mon start
        startOfPeriod.setDate(diff);
        startOfPeriod.setHours(0,0,0,0);
        
        endOfPeriod.setDate(diff + 6);
        endOfPeriod.setHours(23,59,59,999);
      } else if (view === 'month') {
        startOfPeriod.setDate(1);
        startOfPeriod.setHours(0,0,0,0);
        endOfPeriod.setMonth(endOfPeriod.getMonth() + 1);
        endOfPeriod.setDate(0);
        endOfPeriod.setHours(23,59,59,999);
      }

      const query = `?start=${startOfPeriod.toISOString()}&end=${endOfPeriod.toISOString()}`;
      const data = await api.get(`/schedule${query}`);
      setShifts(data);
    } catch (err) {
      console.error("Failed to fetch shifts", err);
    } finally {
      setLoading(false);
    }
  }, [api, date, view]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Derived State
  const staffShifts = useMemo(() => {
    const counts = {};
    staff.forEach(s => counts[s.id] = 0);
    shifts.forEach(s => {
      if (counts[s.staff_id] !== undefined) counts[s.staff_id]++;
    });
    return counts;
  }, [staff, shifts]);

  const upcomingShifts = useMemo(() => {
    const now = new Date();
    return shifts
      .filter(s => {
        const start = new Date(s.start);
        return start.getDate() === now.getDate() && start > now;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 5);
  }, [shifts]);

  // Handlers
  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d);
  };
  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d);
  };
  const handleToday = () => setDate(new Date());
  const handlePeriodChange = (nextView) => {
    setView(nextView);
    localStorage.setItem("globalPeriod", nextView);
    window.dispatchEvent(new CustomEvent("periodChanged", { detail: { period: nextView } }));
  };

  const weekStart = useMemo(() => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [date]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + idx);
      return d;
    });
  }, [weekStart]);

  const dateDisplay = useMemo(() => {
    if (view === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      if (!start || !end) return '';
      const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startLabel} - ${endLabel}`.toUpperCase();
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  }, [date, view, weekDays]);

  const visibleStaffList = useMemo(() => staff.filter(s => visibleStaff.has(s.id)), [staff, visibleStaff]);
  const defaultStaffId = visibleStaffList[0]?.id || staff[0]?.id || '';
  
  // Mini Calendar Navigation
  const handlePrevMonth = () => {
    const d = new Date(date);
    d.setMonth(d.getMonth() - 1);
    setDate(d);
  };
  const handleNextMonth = () => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    setDate(d);
  };
  const handleDateClick = (day) => {
    const d = new Date(date);
    d.setDate(day);
    setDate(d);
  };

  const openActiveStaffModal = (hour) => {
    // Find shifts that overlap with this hour (hour:00 to hour:59)
    const activeStaff = shifts.filter(s => {
      const start = new Date(s.start);
      const end = new Date(s.end);
      
      // Shift starts before or at hour:59 AND ends after or at hour:00
      // Simplest check: start hour <= h AND end hour >= h (approx)
      // More precise: 
      // Slot start: hour:00
      // Slot end: hour+1:00
      // Overlap if start < slot_end AND end > slot_start
      
      const slotStart = new Date(date);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(date);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      
      return start < slotEnd && end > slotStart;
    }).map(s => {
      const staffMember = staff.find(st => st.id === s.staff_id);
      return {
        ...s,
        staffName: staffMember ? `${staffMember.first_name} ${staffMember.last_name}` : 'Unknown',
        role: staffMember?.role || '',
        color: staffMember?.color || '#ccc'
      };
    });

    setActiveStaffModal({
      isOpen: true,
      time: `${String(hour).padStart(2,'0')}:00`,
      staffList: activeStaff
    });
  };

  const toggleStaffVisibility = (id) => {
    const newSet = new Set(visibleStaff);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setVisibleStaff(newSet);
  };

  const openModal = (shift = null, staffId = null, hour = 9) => {
    if (shift) {
      const start = new Date(shift.start);
      const end = new Date(shift.end);
      setEditingShift(shift);
      setModalForm({
        staff_id: shift.staff_id,
        start_time: `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`,
        end_time: `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`,
        note: shift.note || ''
      });
    } else {
      setEditingShift(null);
      setModalForm({
        staff_id: staffId || (staff[0]?.id || ''),
        start_time: `${String(hour).padStart(2,'0')}:00`,
        end_time: `${String(hour + 8).padStart(2,'0')}:00`,
        note: ''
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const [sh, sm] = modalForm.start_time.split(':').map(Number);
      const [eh, em] = modalForm.end_time.split(':').map(Number);
      
      const start = new Date(date);
      start.setHours(sh, sm, 0, 0);
      
      const end = new Date(date);
      end.setHours(eh, em, 0, 0);
      
      const payload = {
        staff_id: parseInt(modalForm.staff_id),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        note: modalForm.note
      };

      if (editingShift) {
        await api.put(`/schedule/${editingShift.id}`, payload);
      } else {
        await api.post('/schedule', payload);
      }
      setModalOpen(false);
      fetchShifts();
    } catch (err) {
      alert("Failed to save shift: " + (err.message || "Unknown error"));
    }
  };

  const handleDelete = async () => {
    if (!editingShift) return;
    if (!window.confirm("Are you sure you want to delete this shift?")) return;
    try {
        await api.delete(`/schedule/${editingShift.id}`);
        setModalOpen(false);
        fetchShifts();
    } catch (err) {
        alert("Failed to delete shift: " + (err.message || "Unknown error"));
    }
  };

  // Tooltip Logic
  const tooltipRef = useRef(null);
  const [tooltipData, setTooltipData] = useState(null);

  const handleMouseEnter = (e, shift) => {
    const s = staff.find(st => st.id === shift.staff_id);
    const start = new Date(shift.start);
    const end = new Date(shift.end);
    setTooltipData({
      name: s ? `${s.first_name} ${s.last_name}` : 'Unknown',
      role: s?.role || '',
      color: s?.color || '#ccc',
      time: `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')} - ${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`,
      note: shift.note
    });
  };
  
  const handleMouseMove = (e) => {
    if (tooltipRef.current) {
      // Adjust tooltip position to not overflow
      const x = e.clientX + 14;
      const y = e.clientY - 10;
      tooltipRef.current.style.left = x + 'px';
      tooltipRef.current.style.top = y + 'px';
    }
  };

  const handleMouseLeave = () => {
    setTooltipData(null);
  };

  // Grid Rendering Helpers
  const renderTimeCol = () => {
    const slots = [];
    for (let h = START_H; h <= END_H; h++) {
      slots.push(
        <div key={h} className="cs-time-slot-label">
          <span>{String(h).padStart(2, '0')}:00</span>
          {view === 'day' && (
            <button 
              className="cs-active-staff-btn"
              aria-label={`View staff working at ${h}:00`}
              onClick={() => openActiveStaffModal(h)}
            >
              👥
            </button>
          )}
        </div>
      );
    }
    return slots;
  };

  const renderWeekCol = (dayDate) => {
    const laneCount = Math.max(visibleStaffList.length, 1);
    const rows = [];
    for (let h = START_H; h <= END_H; h++) {
      rows.push(
        <div 
          key={h} 
          className="cs-time-row" 
          onClick={() => {
            setDate(dayDate);
            openModal(null, defaultStaffId, h);
          }}
        />
      );
    }

    const now = new Date();
    let nowLine = null;
    const isToday = now.getDate() === dayDate.getDate() && now.getMonth() === dayDate.getMonth() && now.getFullYear() === dayDate.getFullYear();
    if (isToday) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const startMin = START_H * 60;
      if (nowMin >= startMin && nowMin <= END_H * 60 + 60) {
        nowLine = (
          <div 
            className="cs-now-line" 
            style={{ top: (nowMin - startMin) * PX_PER_MIN }} 
          />
        );
      }
    }

    const dayShifts = shifts.filter(shift => {
      if (!visibleStaff.has(shift.staff_id)) return false;
      const start = new Date(shift.start);
      return start.getFullYear() === dayDate.getFullYear() &&
        start.getMonth() === dayDate.getMonth() &&
        start.getDate() === dayDate.getDate();
    });

    const shiftLayouts = new Map();
    const shiftsByStaff = new Map();
    dayShifts.forEach((shift) => {
      if (!shiftsByStaff.has(shift.staff_id)) {
        shiftsByStaff.set(shift.staff_id, []);
      }
      shiftsByStaff.get(shift.staff_id).push(shift);
    });
    shiftsByStaff.forEach((staffShifts) => {
      const lanes = [];
      staffShifts
        .map((shift) => {
          const start = new Date(shift.start);
          const end = new Date(shift.end);
          const startMins = start.getHours() * 60 + start.getMinutes();
          const endMins = end.getHours() * 60 + end.getMinutes();
          return { shift, startMins, endMins };
        })
        .sort((a, b) => a.startMins - b.startMins)
        .forEach((item) => {
          let assigned = -1;
          for (let i = 0; i < lanes.length; i += 1) {
            if (lanes[i] <= item.startMins) {
              assigned = i;
              break;
            }
          }
          if (assigned === -1) {
            assigned = lanes.length;
            lanes.push(item.endMins);
          } else {
            lanes[assigned] = item.endMins;
          }
          shiftLayouts.set(item.shift.id, { laneIndex: assigned, laneCount: lanes.length });
        });
    });

    const shiftBlocks = dayShifts.map((shift) => {
      const staffMember = staff.find(st => st.id === shift.staff_id);
      const start = new Date(shift.start);
      const end = new Date(shift.end);
      const sh = start.getHours();
      const sm = start.getMinutes();
      const eh = end.getHours();
      const em = end.getMinutes();
      
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const durationMins = endMins - startMins;

      const top = (startMins - (START_H * 60)) * PX_PER_MIN;
      const height = Math.max(durationMins * PX_PER_MIN - 4, 22);
      const color = staffMember?.color || '#94a3b8';
      const name = staffMember ? `${staffMember.first_name} ${staffMember.last_name}` : 'Shift';
      const staffIndex = visibleStaffList.findIndex(s => s.id === shift.staff_id);
      const doctorLane = staffIndex >= 0 ? staffIndex : 0;
      const layout = shiftLayouts.get(shift.id) || { laneIndex: 0, laneCount: 1 };
      const laneWidth = 100 / laneCount;
      const subLaneWidth = laneWidth / layout.laneCount;
      const leftPercent = doctorLane * laneWidth + layout.laneIndex * subLaneWidth;
      
      return (
        <div
          key={shift.id}
          className="cs-apt cs-week-apt"
          style={{ 
            top: `${top}px`, 
            height: `${height}px`,
            background: `${color}26`,
            borderLeftColor: color,
            color: '#e2e8f0',
            left: `calc(${leftPercent}% + 2px)`,
            width: `calc(${subLaneWidth}% - 4px)`,
            right: 'auto'
          }}
          onClick={(e) => { e.stopPropagation(); openModal(shift); }}
          onMouseEnter={(e) => handleMouseEnter(e, shift)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="cs-apt-time">
            {String(sh).padStart(2,'0')}:{String(sm).padStart(2,'0')} - {String(eh).padStart(2,'0')}:{String(em).padStart(2,'0')}
          </div>
          <div className="cs-apt-name" style={{ marginTop: '2px' }}>{name}</div>
          {shift.note && <div className="cs-week-apt-note">{shift.note}</div>}
        </div>
      );
    });

    return (
      <div key={dayDate.toISOString()} className="cs-doc-col">
        {rows}
        {nowLine}
        {shiftBlocks}
      </div>
    );
  };

  const renderStaffCol = (s) => {
    const rows = [];
    for (let h = START_H; h <= END_H; h++) {
      rows.push(
        <div 
          key={h} 
          className="cs-time-row" 
          onClick={() => openModal(null, s.id, h)}
        />
      );
    }
    
    // Current Time Line
    const now = new Date();
    let nowLine = null;
    const isToday = now.getDate() === date.getDate() && now.getMonth() === date.getMonth();
    if (isToday) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const startMin = START_H * 60;
      if (nowMin >= startMin && nowMin <= END_H * 60 + 60) {
        nowLine = (
          <div 
            className="cs-now-line" 
            style={{ top: (nowMin - startMin) * PX_PER_MIN }} 
          />
        );
      }
    }

    // Shifts
    const sShifts = shifts.filter(shift => shift.staff_id === s.id);
    const shiftBlocks = sShifts.map((shift) => {
      const start = new Date(shift.start);
      const end = new Date(shift.end);
      const sh = start.getHours();
      const sm = start.getMinutes();
      const eh = end.getHours();
      const em = end.getMinutes();
      
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const durationMins = endMins - startMins;

      const top = (startMins - (START_H * 60)) * PX_PER_MIN;
      const height = Math.max(durationMins * PX_PER_MIN - 4, 22);
      
      return (
        <div
          key={shift.id}
          className="cs-apt" // Keeping class name for simplicity, though it's a shift
          style={{ 
            top: `${top}px`, 
            height: `${height}px`,
            background: `${s.color}26`, // 15% opacity
            borderLeftColor: s.color,
            color: '#e2e8f0'
          }}
          onClick={(e) => { e.stopPropagation(); openModal(shift); }}
          onMouseEnter={(e) => handleMouseEnter(e, shift)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="cs-apt-time">
            {String(sh).padStart(2,'0')}:{String(sm).padStart(2,'0')} - {String(eh).padStart(2,'0')}:{String(em).padStart(2,'0')}
          </div>
          <div className="cs-apt-name" style={{ marginTop: '2px' }}>{shift.note || 'Shift'}</div>
        </div>
      );
    });

    return (
      <div key={s.id} className={`cs-doc-col ${s.dc}`}>
        {rows}
        {nowLine}
        {shiftBlocks}
      </div>
    );
  };

  return (
    <div className="clinic-schedule-wrapper">
      {/* TOOLTIP */}
      <div 
        ref={tooltipRef} 
        className={`cs-apt-tooltip ${tooltipData ? 'vis' : ''}`}
        style={{ zIndex: 9999 }}
      >
        {tooltipData && (
          <>
            <div className="cs-tt-name">{tooltipData.name}</div>
            <div className="cs-tt-row">
              <div className="cs-tt-dot" style={{ background: tooltipData.color }}></div>
              <span>{tooltipData.role}</span>
            </div>
            <div className="cs-tt-row">🕐 {tooltipData.time}</div>
            {tooltipData.note && <div className="cs-tt-row">📝 {tooltipData.note}</div>}
          </>
        )}
      </div>

      {/* TOPBAR - Simplified, only nav controls, period is in Layout */}
      <header className="cs-topbar">
        <div className="cs-topbar-left">
          <button className="cs-nav-arrow" onClick={handlePrevDay}>‹</button>
          <div className="cs-date-display" onClick={() => {}}>
            {dateDisplay}
          </div>
          <button className="cs-nav-arrow" onClick={handleNextDay}>›</button>
          <button className="cs-nav-arrow" onClick={handleToday} style={{ width: 'auto', padding: '0 8px', fontSize: '9px', fontWeight: 700, fontFamily: 'var(--cs-mono)' }}>TODAY</button>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <PeriodSelector value={view} onChange={handlePeriodChange} options={["day", "week"]} />
          <button className="cs-btn cs-btn-primary" onClick={() => openModal(null)}>+ Add Shift</button>
        </div>
      </header>

      {/* BODY */}
      <div className="cs-body-row">
        {/* SCHEDULE GRID */}
        <div className="cs-sched-wrap">
          {/* Staff Headers */}
          <div className="cs-doc-header-row">
            <div className="cs-time-col-header"></div>
            <div className="cs-doc-header-cols">
              {view === 'week' ? (
                weekDays.map((day) => (
                  <div key={day.toISOString()} className="cs-doc-header-cell cs-day-header-cell">
                    <div>
                      <div className="cs-dh-name">{day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</div>
                      <div className="cs-dh-count">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</div>
                    </div>
                  </div>
                ))
              ) : (
                visibleStaffList.map(s => (
                  <div key={s.id} className="cs-doc-header-cell">
                    <div className="cs-dh-avatar" style={{ background: `linear-gradient(135deg,${s.color},${s.color}99)` }}>
                      {s.initials}
                    </div>
                    <div>
                      <div className="cs-dh-name">{s.first_name} {s.last_name}</div>
                      <div className="cs-dh-count">{s.role}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Scrollable Grid */}
          <div className="cs-grid-scroll">
            <div className="cs-grid-inner">
              <div className="cs-time-col">
                {renderTimeCol()}
              </div>
              <div className="cs-doc-cols">
                {view === 'week'
                  ? weekDays.map(day => renderWeekCol(day))
                  : visibleStaffList.map(s => renderStaffCol(s))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <aside className="cs-right-panel">
          {/* Mini Calendar */}
          <div className="cs-rp-section">
            <div className="cs-rp-label">Calendar</div>
            <div className="cs-mini-cal-header">
              <button className="cs-mini-arrow" onClick={handlePrevMonth}>‹</button>
              <span className="cs-mini-cal-month">
                {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button className="cs-mini-arrow" onClick={handleNextMonth}>›</button>
            </div>
            <div className="cs-mini-cal-grid">
               {/* Day Headers */}
               {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                 <div key={d} className="cs-mini-cal-dow">{d}</div>
               ))}
               
               {/* Days Generation */}
               {(() => {
                 const year = date.getFullYear();
                 const month = date.getMonth();
                 const firstDay = new Date(year, month, 1);
                 const daysInMonth = new Date(year, month + 1, 0).getDate();
                 // Adjust for Mon start (0=Sun -> 6, 1=Mon -> 0)
                 const startDow = (firstDay.getDay() + 6) % 7;
                 
                 const days = [];
                 // Previous month padding
                 const prevMonthDays = new Date(year, month, 0).getDate();
                 for (let i = 0; i < startDow; i++) {
                   days.push(
                     <div key={`prev-${i}`} className="cs-mini-cal-day other-month">
                       {prevMonthDays - startDow + i + 1}
                     </div>
                   );
                 }
                 
                 // Current month
                 for (let d = 1; d <= daysInMonth; d++) {
                   // Check if has shifts
                   // This requires checking all shifts for this day, which might be expensive if shifts only loaded for current day
                   // Ideally we fetch month overview. For now, simple day rendering.
                   const isSelected = d === date.getDate();
                   const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                   
                   days.push(
                     <div 
                       key={d} 
                       className={`cs-mini-cal-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                       onClick={() => handleDateClick(d)}
                     >
                       {d}
                     </div>
                   );
                 }
                 
                 return days;
               })()}
            </div>
          </div>

          {/* Staff Filters */}
          <div className="cs-rp-section">
            <div className="cs-rp-label">Staff</div>
            <div className="cs-doc-filters">
              {staff.map(s => (
                <div 
                  key={s.id} 
                  className={`cs-doc-filter-row ${!visibleStaff.has(s.id) ? 'off' : ''}`}
                  onClick={() => toggleStaffVisibility(s.id)}
                >
                  <div className="cs-doc-color-dot" style={{ background: s.color }}></div>
                  <span className="cs-doc-filter-name">{s.first_name} {s.last_name}</span>
                  <div className="cs-doc-toggle">{visibleStaff.has(s.id) ? '✓' : ''}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming */}
          <div className="cs-rp-section" style={{ flex: 1, overflow: 'auto' }}>
            <div className="cs-rp-label">Today's Next</div>
            <div className="cs-upcoming-list">
              {upcomingShifts.length === 0 && <div style={{ fontSize: '11px', color: 'var(--cs-subtext)' }}>No upcoming shifts</div>}
              {upcomingShifts.map(s => {
                const staffMember = staff.find(st => st.id === s.staff_id);
                const start = new Date(s.start);
                const end = new Date(s.end);
                return (
                  <div key={s.id} className="cs-upcoming-item" style={{ borderLeftColor: staffMember?.color }} onClick={() => openModal(s)}>
                    <div className="cs-up-time">
                      {String(start.getHours()).padStart(2,'0')}:{String(start.getMinutes()).padStart(2,'0')} - {String(end.getHours()).padStart(2,'0')}:{String(end.getMinutes()).padStart(2,'0')}
                    </div>
                    <div className="cs-up-patient">{staffMember?.first_name} {staffMember?.last_name}</div>
                    <div className="cs-up-doc">{staffMember?.role}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL */}
      <div className={`cs-modal-overlay ${modalOpen ? 'open' : ''}`} onClick={(e) => { if(e.target === e.currentTarget) setModalOpen(false); }}>
        <div className="cs-modal">
          <div className="cs-modal-header">
            <div>
              <div className="cs-modal-title">{editingShift ? 'Edit Shift' : 'New Shift'}</div>
              <div className="cs-topbar-sub">{editingShift ? 'UPDATE DETAILS' : 'SCHEDULE STAFF'}</div>
            </div>
            <button className="cs-modal-close" onClick={() => setModalOpen(false)}>✕</button>
          </div>
          <div className="cs-modal-body">
            <div className="cs-field">
              <div className="cs-field-label">Staff Member</div>
              <select 
                className="cs-field-input"
                value={modalForm.staff_id}
                onChange={e => setModalForm({...modalForm, staff_id: e.target.value})}
              >
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.role})</option>
                ))}
              </select>
            </div>
            <div className="cs-field-row">
              <div className="cs-field">
                <div className="cs-field-label">Start Time</div>
                <input 
                  type="time" 
                  className="cs-field-input"
                  value={modalForm.start_time}
                  onChange={e => setModalForm({...modalForm, start_time: e.target.value})}
                />
              </div>
              <div className="cs-field">
                <div className="cs-field-label">End Time</div>
                <input 
                  type="time" 
                  className="cs-field-input"
                  value={modalForm.end_time}
                  onChange={e => setModalForm({...modalForm, end_time: e.target.value})}
                />
              </div>
            </div>
            <div className="cs-field">
              <div className="cs-field-label">Notes</div>
              <input 
                className="cs-field-input"
                value={modalForm.note}
                onChange={e => setModalForm({...modalForm, note: e.target.value})}
                placeholder="Shift details..."
              />
            </div>
          </div>
          <div className="cs-modal-footer">
             {editingShift && (
                <button className="cs-btn cs-btn-ghost" style={{color: 'var(--cs-red)', borderColor: 'var(--cs-red)', marginRight: 'auto'}} onClick={handleDelete}>Delete</button>
             )}
            <button className="cs-btn cs-btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="cs-btn cs-btn-primary" onClick={handleSave}>Save Shift →</button>
          </div>
        </div>
      </div>

      {/* ACTIVE STAFF MODAL */}
      <div className={`cs-modal-overlay ${activeStaffModal.isOpen ? 'open' : ''}`} onClick={(e) => { if(e.target === e.currentTarget) setActiveStaffModal({...activeStaffModal, isOpen: false}); }}>
        <div className="cs-modal">
          <div className="cs-modal-header">
            <div>
              <div className="cs-modal-title">Staff on Duty</div>
              <div className="cs-topbar-sub">ACTIVE AT {activeStaffModal.time}</div>
            </div>
            <button className="cs-modal-close" onClick={() => setActiveStaffModal({...activeStaffModal, isOpen: false})}>✕</button>
          </div>
          <div className="cs-modal-body">
            {activeStaffModal.staffList.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--cs-subtext)', padding: '20px' }}>
                No staff scheduled for this time.
              </div>
            ) : (
              <div className="cs-active-staff-list">
                {activeStaffModal.staffList.map(s => {
                   const start = new Date(s.start);
                   const end = new Date(s.end);
                   return (
                    <div key={s.id} className="cs-active-staff-item" style={{ borderLeft: `3px solid ${s.color}` }}>
                      <div className="cs-as-name">{s.staffName}</div>
                      <div className="cs-as-role">{s.role}</div>
                      <div className="cs-as-time">
                        {String(start.getHours()).padStart(2,'0')}:{String(start.getMinutes()).padStart(2,'0')} - {String(end.getHours()).padStart(2,'0')}:{String(end.getMinutes()).padStart(2,'0')}
                      </div>
                    </div>
                   );
                })}
              </div>
            )}
          </div>
          <div className="cs-modal-footer">
            <button className="cs-btn cs-btn-primary" onClick={() => setActiveStaffModal({...activeStaffModal, isOpen: false})}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
