import schema from '../data/saf-schema.json'
import SchemaExplorer from './SchemaExplorer.jsx'

export default function SafExplorer({ table }) {
  return <SchemaExplorer schema={schema} tab="saff" initialTable={table} />
}
