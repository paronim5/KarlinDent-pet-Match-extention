
import React from 'react';
import ClinicSchedule from './ClinicSchedule';
import './ClinicSchedule.css';

export default {
  title: 'Components/ClinicSchedule',
  component: ClinicSchedule,
};

const mockStaff = [
  { id: 1, first_name: 'Dr. House', last_name: '', role: 'doctor', is_active: true },
  { id: 2, first_name: 'Dr. Wilson', last_name: '', role: 'doctor', is_active: true },
  { id: 3, first_name: 'Nurse Joy', last_name: '', role: 'assistant', is_active: true },
];

const mockShifts = [
  {
    id: 1,
    staff_id: 1,
    start: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
    end: new Date(new Date().setHours(17, 0, 0, 0)).toISOString(),
    note: 'Day Shift'
  },
  {
    id: 2,
    staff_id: 3,
    start: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
    end: new Date(new Date().setHours(16, 0, 0, 0)).toISOString(),
    note: 'Morning Shift'
  }
];

const mockApi = {
  get: (path) => {
    if (path === '/staff') return Promise.resolve(mockStaff);
    if (path.startsWith('/schedule')) return Promise.resolve(mockShifts);
    return Promise.resolve([]);
  },
  post: () => Promise.resolve({ id: 99, status: 'created' }),
  put: () => Promise.resolve({ status: 'updated' }),
  delete: () => Promise.resolve({ status: 'deleted' })
};

const Template = (args) => <div style={{ height: '800px', padding: '20px', background: '#222' }}><ClinicSchedule {...args} /></div>;

export const Default = Template.bind({});
Default.args = {
  api: mockApi
};
