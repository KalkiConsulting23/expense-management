import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './assets/Navbar'
import Employee from './assets/employee'
import Project  from './assets/project'
import EmployeeTable from './assets/employeetable'
import Projecttable from './assets/projecttable'
import Salesform from './assets/salesform'
import Salestable from './assets/salestable'
import Salesanl from './assets/salesanl'
import Projectanl from './assets/projectanl'
import Expenseanl from './assets/expenseanl'

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <div style={{ paddingTop: '70px' }}></div>
      <Routes>
        <Route path="/" element={<Employee />} />
        <Route path="/projecttable" element={<Projecttable />} />   
        <Route  path ="/employee" element={<EmployeeTable />} />
        <Route path ="/project" element={<Project />} />
        <Route path ="/salesform" element={<Salesform />} />
        <Route path ="/salestable" element={<Salestable />} />
        <Route path ='/salesanl' element={<Salesanl />} />
        <Route path = '/projectanl' element ={<Projectanl />} />
        <Route path = '/expenseanl' element={<Expenseanl />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App