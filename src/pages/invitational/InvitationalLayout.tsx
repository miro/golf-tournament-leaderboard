import { Outlet } from 'react-router-dom'

/** Phone-shaped frame for the whole Invitational section. On a phone the column is
 * the screen and none of this shows; on a desktop the content stays at phone width
 * and the watermarked backdrop fills the space either side.
 *
 * The 430px cap is what lets the roster carousel read as a phone screenshot on any
 * display, so every /invitational/* route sits inside it. */
export default function InvitationalLayout() {
  return (
    <div
      className="invitational-shell flex justify-center w-full"
      style={{ minHeight: '100dvh', backgroundColor: '#0F0B08' }}
    >
      <div
        className="relative w-full"
        style={{
          zIndex: 1,
          maxWidth: 430,
          minHeight: '100dvh',
          backgroundColor: '#17130F',
          // border-box is on globally, so these sit inside the 430px rather than
          // pushing the column two pixels wider than the viewport on a phone.
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Outlet />
      </div>
    </div>
  )
}
