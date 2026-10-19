import { IoCarOutline, IoCarSportOutline } from 'react-icons/io5';

export default function SharedVehicleMarkerContent({ vehicleModel, vehicleType }) {
  const sports = vehicleType === 'sports';
  return <div className={`shared-vehicle-marker${sports ? ' is-sports' : ''}`} title={`其他用戶 · ${vehicleModel}`}>
    <span className="shared-vehicle-label">{vehicleModel}</span>
    <span className="shared-vehicle-icon">{sports ? <IoCarSportOutline aria-hidden="true" /> : <IoCarOutline aria-hidden="true" />}</span>
  </div>;
}
