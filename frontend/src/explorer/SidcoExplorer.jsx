import schema from '../data/sidco-schema.json'
import SchemaExplorer from './SchemaExplorer.jsx'

export default function SidcoExplorer({ table }) {
  return <SchemaExplorer schema={schema} tab="sidco" initialTable={table} />
}
